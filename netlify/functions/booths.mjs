import { respond, service } from '../../lib/http.mjs';
export default request => respond(request, () => {
  const params = new URL(request.url).searchParams;
  return service.booths(params.get('id'), params.get('page') ?? '0');
});
