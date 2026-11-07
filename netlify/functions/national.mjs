import { respond, service } from '../../lib/http.mjs';
export default request => respond(request, () => service.national());
