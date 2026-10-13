import worker from './server'
import { withNativeDevIdentity } from './platform/base-auth/dev'
export default withNativeDevIdentity(worker)
