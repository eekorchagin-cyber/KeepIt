import { inviteCode, isInviteCode, localAuthEmail, normalizeCode, randomPassword } from '../codes'
import { db } from '../db'
import { newId, nowIso } from '../ids'
import { updateSettings } from '../repository'
import { getSupabase, supabaseConfigured } from './client'

export function cloudReady(): boolean {
  return supabaseConfigured()
}

async function ensureAuthUser(): Promise<{ userId: string }> {
  const client = getSupabase()
  if (!client) throw new Error('Supabase не настроен')

  const { data: sessionData } = await client.auth.getSession()
  if (sessionData.session?.user) {
    return { userId: sessionData.session.user.id }
  }

  const userId = newId()
  const email = localAuthEmail(userId)
  const password = randomPassword()
  const { data, error } = await client.auth.signUp({ email, password })
  if (error || !data.user) {
    const signedIn = await client.auth.signInWithPassword({ email, password })
    if (signedIn.error || !signedIn.data.user) {
      throw new Error(error?.message ?? signedIn.error?.message ?? 'Не удалось войти')
    }
    return { userId: signedIn.data.user.id }
  }
  return { userId: data.user.id }
}

export async function createFamily(name: string, displayName: string): Promise<string> {
  const client = getSupabase()
  if (!client) throw new Error('Сначала заполните VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY')

  const { userId } = await ensureAuthUser()
  const familyId = newId()

  const { error: familyError } = await client.from('families').insert({
    id: familyId,
    name: name.trim() || 'Семья',
    created_by: userId,
  })
  if (familyError) throw new Error(familyError.message)

  const { error: profileError } = await client.from('profiles').upsert({
    id: userId,
    family_id: familyId,
    display_name: displayName.trim() || 'Глава семьи',
    role: 'admin',
  })
  if (profileError) throw new Error(profileError.message)

  await db.transaction('rw', db.places, db.items, db.moves, db.settings, async () => {
    await db.places.toCollection().modify({ familyId })
    await db.items.toCollection().modify({ familyId })
    await db.moves.toCollection().modify({ familyId })
    await db.settings.put({
      ...(await db.settings.get('settings'))!,
      familyId,
      familyName: name.trim() || 'Семья',
      displayName: displayName.trim() || 'Глава семьи',
      role: 'admin',
      lastSyncAt: nowIso(),
    })
  })

  await pushLocalCatalog(familyId)
  return familyId
}

export async function createInvite(): Promise<string> {
  const client = getSupabase()
  if (!client) throw new Error('Supabase не настроен')
  const { data: session } = await client.auth.getSession()
  if (!session.session) throw new Error('Нужен вход')

  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('family_id, role')
    .eq('id', session.session.user.id)
    .maybeSingle()
  if (profileError) throw new Error(profileError.message)
  if (!profile?.family_id || profile.role !== 'admin') {
    throw new Error('Приглашения создаёт только глава семьи')
  }

  await client.from('invites').delete().eq('family_id', profile.family_id)
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = inviteCode()
    const { error } = await client.from('invites').insert({
      code: normalizeCode(code),
      family_id: profile.family_id,
      created_by: session.session.user.id,
    })
    if (!error) return code
  }
  throw new Error('Не удалось создать код')
}

export async function joinFamily(codeRaw: string, displayName: string): Promise<void> {
  const client = getSupabase()
  if (!client) throw new Error('Supabase не настроен')
  if (!isInviteCode(codeRaw)) throw new Error('Нужен код вида D-XXXXX')

  await ensureAuthUser()
  const { data, error } = await client.rpc('redeem_invite', {
    p_code: normalizeCode(codeRaw),
    p_name: displayName.trim(),
  })
  if (error) throw new Error(error.message)

  const familyId = data as string
  const { data: family } = await client.from('families').select('name').eq('id', familyId).maybeSingle()

  await updateSettings({
    familyId,
    familyName: family?.name ?? 'Семья',
    displayName: displayName.trim(),
    role: 'member',
    lastSyncAt: nowIso(),
  })

  await pullRemoteCatalog(familyId)
}

export async function pushLocalCatalog(familyId: string): Promise<void> {
  const client = getSupabase()
  if (!client) return

  const places = await db.places.toArray()
  const items = await db.items.toArray()

  if (places.length) {
    const rows = places.map((place) => ({
      id: place.id,
      family_id: familyId,
      parent_id: place.parentId,
      object_key: place.objectKey,
      name: place.name,
      type: place.type,
      code: place.code,
      note: place.note,
      archived: place.archived,
      visibility: place.visibility,
      version: place.version,
      updated_at: place.updatedAt,
    }))
    const { error } = await client.from('places').upsert(rows)
    if (error) throw new Error(error.message)
  }

  if (items.length) {
    const rows = items.map((item) => ({
      id: item.id,
      family_id: familyId,
      place_id: item.placeId,
      name: item.name,
      mode: item.mode,
      category: item.category,
      subcategory: item.subcategory,
      unit: item.unit,
      quantity: item.quantity,
      note: item.note,
      tags: item.tags,
      needs_fill: item.needsFill,
      visibility: item.visibility,
      version: item.version,
      updated_at: item.updatedAt,
    }))
    const { error } = await client.from('items').upsert(rows)
    if (error) throw new Error(error.message)
  }

  await db.places.toCollection().modify({ syncStatus: 'synced' })
  await db.items.toCollection().modify({ syncStatus: 'synced' })
  await updateSettings({ lastSyncAt: nowIso() })
}

export async function pullRemoteCatalog(familyId: string): Promise<void> {
  const client = getSupabase()
  if (!client) return

  const { data: places, error: placesError } = await client
    .from('places')
    .select('*')
    .eq('family_id', familyId)
  if (placesError) throw new Error(placesError.message)

  const { data: items, error: itemsError } = await client
    .from('items')
    .select('*')
    .eq('family_id', familyId)
  if (itemsError) throw new Error(itemsError.message)

  await db.transaction('rw', db.places, db.items, async () => {
    await db.places.clear()
    await db.items.clear()
    if (places?.length) {
      await db.places.bulkPut(
        places.map((row) => ({
          id: row.id,
          familyId: row.family_id,
          parentId: row.parent_id,
          objectKey: row.object_key,
          name: row.name,
          type: row.type,
          code: row.code,
          note: row.note ?? '',
          archived: row.archived,
          visibility: row.visibility,
          version: row.version,
          updatedAt: row.updated_at,
          syncStatus: 'synced' as const,
        })),
      )
    }
    if (items?.length) {
      await db.items.bulkPut(
        items.map((row) => ({
          id: row.id,
          familyId: row.family_id,
          placeId: row.place_id,
          name: row.name,
          mode: row.mode,
          category: row.category,
          subcategory: row.subcategory ?? '',
          unit: row.unit,
          quantity: Number(row.quantity),
          note: row.note ?? '',
          tags: row.tags ?? [],
          needsFill: row.needs_fill,
          visibility: row.visibility,
          version: row.version,
          updatedAt: row.updated_at,
          syncStatus: 'synced' as const,
        })),
      )
    }
  })

  await updateSettings({ lastSyncAt: nowIso() })
}

export async function syncNow(): Promise<void> {
  const client = getSupabase()
  if (!client) throw new Error('Supabase не настроен')
  const settings = await db.settings.get('settings')
  if (!settings?.familyId) throw new Error('Семья ещё не создана')
  await pushLocalCatalog(settings.familyId)
  await pullRemoteCatalog(settings.familyId)
}
