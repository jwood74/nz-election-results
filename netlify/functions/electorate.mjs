import { respond, service } from '../../lib/http.mjs';
export default request => respond(request, () => service.electorate(new URL(request.url).searchParams.get('id')));
