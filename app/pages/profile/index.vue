<script setup lang="ts">
import { AlertTriangle, Camera, Check, Fingerprint, KeyRound, LogOut, Pencil, Plus, Trash2, X } from 'lucide-vue-next'
import type { AuthUser, PasskeyInfo } from '~/types/music'
import { useAuthStore } from '~/stores/auth'
import { usePlayerStore } from '~/stores/player'
import { defaultPasskeyName, usePasskeys } from '~/composables/usePasskeys'
import { apiErrorMessage, useToast } from '~/composables/useToast'
import { mediaUrl } from '~/types/music'

const auth = useAuthStore()
const player = usePlayerStore()
const passkeysApi = usePasskeys()
const toast = useToast()

const nameDraft = ref(auth.displayName)
const editing = ref(false)
const saving = ref(false)
const usernameDraft = ref('')
const editingUsername = ref(false)
const savingUsername = ref(false)

const { status: usernameStatus, message: usernameMessage, run: checkUsername, dispose: disposeUsernameCheck } = useUsernameCheck()
watch(usernameDraft, (v) => checkUsername(v, auth.user?.username))
onBeforeUnmount(disposeUsernameCheck)
const uploading = ref(false)
const error = ref<string | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

// --- Passkeys ---
const passkeys = ref<PasskeyInfo[]>([])
const passkeysLoading = ref(false)
const addingPasskey = ref(false)
const removingPasskey = ref<string | null>(null)

// --- Delete account ---
const deleteOpen = ref(false)
const deleteConfirm = ref('')
const deleting = ref(false)
const deleteError = ref<string | null>(null)
const confirmMatches = computed(
  () => deleteConfirm.value.trim().toLowerCase() === (auth.user?.username || '').toLowerCase(),
)

function initials(): string {
  const name = auth.displayName || auth.user?.username || '?'
  return name
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function startEdit(): void {
  nameDraft.value = auth.displayName
  editing.value = true
  error.value = null
}

function startUsernameEdit(): void {
  usernameDraft.value = auth.user?.username || ''
  editingUsername.value = true
  error.value = null
}

async function saveUsername(): Promise<void> {
  const next = usernameDraft.value.trim()
  if (!next || next.toLowerCase() === auth.user?.username) {
    editingUsername.value = false
    return
  }
  if (usernameStatus.value === 'taken' || usernameStatus.value === 'invalid') {
    return
  }
  savingUsername.value = true
  error.value = null
  try {
    const res = await $fetch<{ user: AuthUser }>('/api/profile', {
      method: 'PATCH',
      body: { username: next },
    })
    auth.setUser(res.user)
    editingUsername.value = false
    toast.success('Username updated.')
  } catch (err: any) {
    error.value = apiErrorMessage(err, 'Could not update your username.')
  } finally {
    savingUsername.value = false
  }
}

async function saveName(): Promise<void> {
  const next = nameDraft.value.trim().slice(0, 40)
  if (!next || next === auth.displayName) {
    editing.value = false
    return
  }
  saving.value = true
  error.value = null
  try {
    const res = await $fetch<{ user: AuthUser }>('/api/profile', {
      method: 'PATCH',
      body: { displayName: next },
    })
    auth.setUser(res.user)
    editing.value = false
    toast.success('Display name updated.')
  } catch (err: any) {
    error.value = apiErrorMessage(err, 'Could not update your display name.')
  } finally {
    saving.value = false
  }
}

async function onAvatarPicked(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploading.value = true
  error.value = null
  try {
    const form = new FormData()
    form.append('avatar', file)
    const res = await $fetch<{ user: AuthUser }>('/api/profile/avatar', {
      method: 'POST',
      body: form,
    })
    auth.setUser(res.user)
    toast.success('Avatar updated.')
  } catch (err: any) {
    error.value = apiErrorMessage(err, 'Could not upload that image.')
  } finally {
    uploading.value = false
    input.value = ''
  }
}

async function loadPasskeys(): Promise<void> {
  passkeysLoading.value = true
  try {
    passkeys.value = await passkeysApi.listPasskeys()
  } catch (err: any) {
    toast.error(apiErrorMessage(err, 'Could not load your passkeys.'))
  } finally {
    passkeysLoading.value = false
  }
}

async function addPasskey(): Promise<void> {
  error.value = null
  addingPasskey.value = true
  try {
    await passkeysApi.registerPasskey(defaultPasskeyName())
    // The composable bumps passkeysChanged → the watcher below reloads the list.
    toast.success('Passkey saved.')
  } catch (err: any) {
    error.value = apiErrorMessage(err, 'Could not save the passkey.')
  } finally {
    addingPasskey.value = false
  }
}

async function removePasskey(id: string): Promise<void> {
  removingPasskey.value = id
  try {
    await passkeysApi.removePasskey(id)
    passkeys.value = passkeys.value.filter((p) => p.id !== id)
    toast.success('Passkey removed.')
  } catch (err: any) {
    toast.error(apiErrorMessage(err, 'Could not remove the passkey.'))
  } finally {
    removingPasskey.value = null
  }
}

async function signOut(): Promise<void> {
  await auth.signOut()
  player.reset()
  toast.info('Signed out. Sweet dreams.')
  // Hard refresh so every store, the audio element, and the session start
  // clean; the guest middleware then lands on the sign-in page.
  window.location.reload()
}

async function deleteAccount(): Promise<void> {
  deleting.value = true
  deleteError.value = null
  try {
    await $fetch('/api/auth/delete-account', { method: 'POST' })
    auth.setUser(null)
    player.reset()
    toast.info('Account deleted. Sweet dreams.')
    // Hard refresh — the guest middleware lands on the sign-in page with
    // every store and the audio element reset.
    window.location.reload()
  } catch (err: any) {
    deleteError.value = apiErrorMessage(err, 'Could not delete your account.')
    deleting.value = false
  }
}

// Keep the list in sync when passkeys change anywhere in the app (e.g. a
// passkey added via the banner while this page is already mounted).
watch(passkeysApi.passkeysChanged, () => {
  void loadPasskeys()
})

onMounted(loadPasskeys)
useHead({ title: 'Profile' })
</script>

<template>
  <div class="animate-fade-in">
    <ProfileSubNav />

    <div class="pillow flex flex-col gap-6 p-6 sm:p-8">
      <!-- Header: avatar, name, sign out (top right) -->
      <div class="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
        <!-- Avatar -->
        <button
          type="button"
          class="group relative h-20 w-20 shrink-0 overflow-hidden rounded-pillow-lg shadow-glow"
          :disabled="uploading"
          :aria-label="uploading ? 'Uploading avatar…' : 'Change avatar'"
          @click="fileInput?.click()"
        >
          <img
            v-if="auth.user?.profile?.avatarKey"
            :src="mediaUrl(auth.user.profile.avatarKey)"
            :alt="`${auth.displayName} avatar`"
            class="h-full w-full object-cover"
          />
          <div
            v-else
            class="flex h-full w-full items-center justify-center bg-gradient-to-br from-lavender-400/70 to-plum-600/70 text-xl font-semibold text-night-950"
          >
            {{ initials() }}
          </div>
          <div
            class="absolute inset-0 flex items-center justify-center bg-night-950/60 opacity-0 transition-opacity group-hover:opacity-100"
          >
            <Camera class="h-6 w-6 text-cream" />
          </div>
        </button>
        <input ref="fileInput" type="file" accept="image/jpeg,image/png,image/webp" class="hidden" @change="onAvatarPicked" />

        <!-- Name + username -->
        <div class="min-w-0 flex-1 text-center sm:text-left">
          <template v-if="editing">
            <div class="flex flex-col items-center gap-2 sm:flex-row">
              <Input
                v-model="nameDraft"
                :maxlength="40"
                autofocus
                class="w-full sm:max-w-xs"
                aria-label="Display name"
                @keydown.enter="saveName"
                @keydown.esc="editing = false"
              />
              <div class="flex gap-2">
                <Button type="button" size="sm" :disabled="saving" @click="saveName">
                  <Check class="h-4 w-4" />
                  {{ saving ? 'Saving…' : 'Save' }}
                </Button>
                <Button type="button" size="sm" variant="ghost" :disabled="saving" @click="editing = false">
                  <X class="h-4 w-4" />
                </Button>
              </div>
            </div>
          </template>
          <template v-else>
            <div class="flex items-center justify-center gap-1.5 sm:justify-start">
              <h1 class="font-display text-2xl font-semibold text-cream sm:text-3xl">
                {{ auth.displayName }}
              </h1>
              <button
                type="button"
                class="rounded-full p-1.5 text-cream-faint transition-colors hover:bg-white/8 hover:text-cream"
                aria-label="Edit display name"
                @click="startEdit"
              >
                <Pencil class="h-4 w-4" />
              </button>
            </div>
            <div class="mt-0.5 text-sm text-cream-dim">
            <p class="flex items-center justify-center gap-1.5 sm:justify-start">
              <template v-if="editingUsername">
                <span class="text-cream-faint">@</span>
                <Input
                  v-model="usernameDraft"
                  :maxlength="32"
                  autofocus
                  class="h-8 w-40"
                  aria-label="Username"
                  @keydown.enter="saveUsername"
                  @keydown.esc="editingUsername = false"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  :disabled="savingUsername || usernameStatus === 'taken' || usernameStatus === 'invalid'"
                  @click="saveUsername"
                >
                  {{ savingUsername ? 'Saving…' : 'Save' }}
                </Button>
                <Button type="button" size="sm" variant="ghost" :disabled="savingUsername" @click="editingUsername = false">
                  Cancel
                </Button>
              </template>
              <template v-else>
                <span>@{{ auth.user?.username }}</span>
                <button
                  type="button"
                  class="rounded-full p-1 text-cream-faint transition-colors hover:bg-white/8 hover:text-cream"
                  aria-label="Change username"
                  @click="startUsernameEdit"
                >
                  <Pencil class="h-3 w-3" />
                </button>
              </template>
            </p>
            <p
              v-if="editingUsername && (usernameStatus === 'checking' || usernameStatus === 'valid' || usernameStatus === 'taken' || usernameStatus === 'invalid')"
              class="mt-1 text-xs"
              :class="{
                'text-cream-faint': usernameStatus === 'checking',
                'text-lavender-300': usernameStatus === 'valid',
                'text-rose-300/90': usernameStatus === 'taken' || usernameStatus === 'invalid',
              }"
              aria-live="polite"
            >
              {{ usernameMessage }}
            </p>
            </div>
          </template>

          <p v-if="error" class="mt-3 rounded-pillow-sm bg-rose-500/10 px-4 py-2.5 text-sm text-rose-200">
            {{ error }}
          </p>
        </div>

        <!-- Sign out (top right on desktop, below on mobile) -->
        <Button
          type="button"
          variant="ghost"
          class="shrink-0 self-center text-rose-200 hover:bg-rose-500/10 hover:text-rose-100 sm:mt-1 sm:self-start"
          @click="signOut"
        >
          <LogOut class="h-4 w-4" />
          Sign out
        </Button>
      </div>

      <div class="h-px bg-white/8" />

      <!-- Passkeys -->
      <section>
        <div class="mb-1 flex items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <Fingerprint class="h-4 w-4 text-lavender-300" />
            <h2 class="text-sm font-medium text-cream-muted">Passkeys</h2>
          </div>
          <Button type="button" size="sm" :disabled="addingPasskey" @click="addPasskey">
            <Plus class="h-4 w-4" />
            {{ addingPasskey ? 'Waiting…' : 'Add passkey' }}
          </Button>
        </div>
        <p class="mb-4 text-sm text-cream-dim">
          Sign in with your face, fingerprint, or device — no password needed.
        </p>

        <div v-if="passkeysLoading" class="py-4 text-center text-sm text-cream-dim">Loading…</div>

        <div v-else-if="passkeys.length === 0" class="flex flex-col items-center gap-2 rounded-pillow-sm bg-white/4 px-4 py-5 text-center">
          <KeyRound class="h-5 w-5 text-cream-faint" />
          <p class="text-sm text-cream-dim">No passkeys yet.</p>
        </div>

        <div v-else class="flex flex-col gap-2">
          <div
            v-for="passkey in passkeys"
            :key="passkey.id"
            class="flex items-center gap-3 rounded-pillow-sm bg-white/4 px-3.5 py-2.5"
          >
            <Fingerprint class="h-4 w-4 shrink-0 text-lavender-300" />
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm text-cream">{{ passkey.name }}</p>
              <p class="truncate text-[11px] text-cream-dim">
                Added {{ formatDate(passkey.createdAt) }}
                <template v-if="passkey.lastUsedAt"> · last used {{ formatDate(passkey.lastUsedAt) }}</template>
              </p>
            </div>
            <button
              type="button"
              class="rounded-full p-2 text-cream-dim transition-colors hover:bg-white/8 hover:text-rose-200"
              :disabled="removingPasskey === passkey.id"
              :aria-label="`Remove ${passkey.name}`"
              @click="removePasskey(passkey.id)"
            >
              <Trash2 class="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      <div class="h-px bg-white/8" />

      <!-- Danger zone -->
      <section>
        <div class="mb-1 flex items-center gap-2">
          <AlertTriangle class="h-4 w-4 text-rose-300/80" />
          <h2 class="text-sm font-medium text-cream-muted">Danger zone</h2>
        </div>
        <p class="mb-4 text-sm text-cream-dim">
          Deleting your account removes your favourites, playlists, history, and passkeys forever.
        </p>
        <Button type="button" variant="destructive" @click="deleteOpen = true">
          <Trash2 class="h-4 w-4" />
          Delete account
        </Button>
      </section>
    </div>

    <!-- Delete account confirmation -->
    <Dialog v-model:open="deleteOpen">
      <DialogContent class="max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete your account?</DialogTitle>
          <DialogDescription>
            This is permanent. Your favourites, playlists, history, passkeys, and downloads will
            be gone — there is no undo.
          </DialogDescription>
        </DialogHeader>

        <p v-if="deleteError" class="rounded-pillow-sm bg-rose-500/10 px-4 py-2.5 text-sm text-rose-200">
          {{ deleteError }}
        </p>

        <div class="flex flex-col gap-2">
          <Label for="delete-confirm">Type your username to confirm</Label>
          <Input
            id="delete-confirm"
            v-model="deleteConfirm"
            type="text"
            autocomplete="off"
            :placeholder="`${auth.user?.username}`"
            autofocus
            @keydown.enter="confirmMatches && deleteAccount()"
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" :disabled="deleting" @click="deleteOpen = false">
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            :disabled="!confirmMatches || deleting"
            @click="deleteAccount"
          >
            <Trash2 class="h-4 w-4" />
            {{ deleting ? 'Deleting…' : 'Delete account' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
