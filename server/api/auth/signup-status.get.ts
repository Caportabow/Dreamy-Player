import { env } from '../../utils/env'

// Public on purpose: guests need to know whether signups are open before
// reaching the signup form (and the signin page uses it to hide the link).
export default defineEventHandler(() => ({ allowed: env.allowSignup }))
