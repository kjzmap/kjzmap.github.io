import { createApp } from '../_shared/markers.mjs';
import { createSupabaseStore } from '../_shared/supabase-store.mjs';

const routes = new Set(['/api/markers', '/api/admin']);
const mapOrigins = new Set(['https://jace050313.github.io', 'https://kjzmap.github.io']);

export function createMapFunction({ projectUrl, secretKey, password, sessionSecret }) {
  const configured = projectUrl && secretKey;
  const handle = configured ? createApp(createSupabaseStore(projectUrl, secretKey), {
    password,
    secret: sessionSecret?.length >= 32 ? sessionSecret : undefined,
    bearer: true
  }) : null;

  return async function fetchRequest(request) {
    const headers = new Headers({
      Vary: 'Origin',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    const origin = request.headers.get('origin');
    if (origin && !mapOrigins.has(origin)) {
      return Response.json({ error: '此来源无法访问标记服务。' }, { status: 403, headers });
    }
    if (origin) {
      headers.set('Access-Control-Allow-Origin', origin);
      headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
      headers.set('Access-Control-Allow-Headers', 'Content-Type, X-Owner-Key, Authorization');
      headers.set('Access-Control-Max-Age', '600');
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/^(?:\/functions\/v1)?\/qunyou-map(?=\/)/, '');
    if (!routes.has(path)) return Response.json({ error: '接口不存在。' }, { status: 404, headers });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (!handle) return Response.json({ error: '共享数据库尚未配置。' }, { status: 503, headers });

    url.pathname = path;
    // Keep a shared login limit instead of trusting client-supplied IP headers.
    const response = await handle(new Request(url, request));
    response.headers.forEach((value, name) => headers.set(name, value));
    return new Response(response.body, { status: response.status, headers });
  };
}
