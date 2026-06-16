// vibecat 試用モード用の DeepSeek API プロキシ (Cloudflare Worker)
//
// APIキーは Worker の Secret (DEEPSEEK_API_KEY) に保持し、クライアントには渡さない。
// デプロイ:
//   cd worker
//   npx wrangler deploy
//   npx wrangler secret put DEEPSEEK_API_KEY   # 支出上限付きのキーを推奨

// お試しモードは低コストの deepseek-chat のみ許可
const ALLOWED_MODELS = [
    'deepseek-chat'
];

const MAX_TOKENS_LIMIT = 16000;

// fetch-url: AIが外部URLを取得するために使う。レスポンスは最大200KBのテキスト
const FETCH_URL_MAX_BYTES = 200 * 1024;
// 許可するプロトコル(httpとhttpsのみ)
const ALLOWED_PROTOCOLS = ['https:', 'http:'];

const corsHeaders = (request, allowedOrigins) => {
    const origin = request.headers.get('Origin') || '';
    const allowed = allowedOrigins.includes(origin);
    return {
        allowed,
        headers: {
            'Access-Control-Allow-Origin': allowed ? origin : allowedOrigins[0],
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers':
                request.headers.get('Access-Control-Request-Headers') || '*',
            'Access-Control-Max-Age': '86400',
            Vary: 'Origin'
        }
    };
};

export default {
    async fetch(request, env) {
        const allowedOrigins = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim());
        const cors = corsHeaders(request, allowedOrigins);

        if (request.method === 'OPTIONS') {
            return new Response(null, {status: 204, headers: cors.headers});
        }
        if (!cors.allowed) {
            return Response.json({error: 'origin not allowed'}, {status: 403, headers: cors.headers});
        }

        // パスワード検証(TRIAL_PASSWORD が設定されている場合のみ有効)
        const trialPassword = env.TRIAL_PASSWORD || '';
        if (trialPassword) {
            const authHeader = request.headers.get('Authorization') || '';
            const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
            if (token !== trialPassword) {
                return Response.json({error: 'unauthorized'}, {status: 401, headers: cors.headers});
            }
        }

        const url = new URL(request.url);

        // GET /fetch-url?url=... — 外部URLのコンテンツをテキストで返す
        if (request.method === 'GET' && url.pathname === '/fetch-url') {
            const targetUrl = url.searchParams.get('url');
            if (!targetUrl) {
                return Response.json({error: 'url parameter required'}, {status: 400, headers: cors.headers});
            }
            let parsed;
            try {
                parsed = new URL(targetUrl);
            } catch {
                return Response.json({error: 'invalid url'}, {status: 400, headers: cors.headers});
            }
            if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
                return Response.json({error: 'protocol not allowed'}, {status: 400, headers: cors.headers});
            }
            // github.com の URL を raw.githubusercontent.com に自動変換
            // https://github.com/{owner}/{repo}/blob/{branch}/{path}
            //   → https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}
            // https://github.com/{owner}/{repo} (ルート) は README.md を取得
            const ghBlobMatch = parsed.href.match(
                /^https:\/\/github\.com\/([^/]+\/[^/]+)\/blob\/([^/]+)\/(.+)$/
            );
            const ghRootMatch = !ghBlobMatch && parsed.href.match(
                /^https:\/\/github\.com\/([^/]+\/[^/]+?)\/?(?:#.*)?$/
            );
            let resolvedUrl = parsed.href;
            if (ghBlobMatch) {
                resolvedUrl = `https://raw.githubusercontent.com/${ghBlobMatch[1]}/${ghBlobMatch[2]}/${ghBlobMatch[3]}`;
            } else if (ghRootMatch) {
                // ルートURLはデフォルトブランチの README.md を試みる(main → master の順)
                resolvedUrl = `https://raw.githubusercontent.com/${ghRootMatch[1]}/main/README.md`;
            }
            const fetchText = async (fetchUrl) => {
                const upstream = await fetch(fetchUrl, {
                    headers: {'User-Agent': 'Mozilla/5.0 (compatible; vibecat-bot/1.0)'},
                    redirect: 'follow'
                });
                if (!upstream.ok) return {ok: false, status: upstream.status};
                const contentType = upstream.headers.get('content-type') || '';
                if (!contentType.includes('text') && !contentType.includes('json') &&
                    !contentType.includes('javascript') && !contentType.includes('xml')) {
                    return {ok: false, status: upstream.status, binaryType: contentType};
                }
                const reader = upstream.body.getReader();
                const chunks = [];
                let total = 0;
                while (true) {
                    const {done, value} = await reader.read();
                    if (done) break;
                    total += value.length;
                    if (total > FETCH_URL_MAX_BYTES) {
                        chunks.push(value.slice(0, FETCH_URL_MAX_BYTES - (total - value.length)));
                        break;
                    }
                    chunks.push(value);
                }
                const text = new TextDecoder().decode(
                    chunks.reduce((acc, c) => {
                        const merged = new Uint8Array(acc.length + c.length);
                        merged.set(acc);
                        merged.set(c, acc.length);
                        return merged;
                    }, new Uint8Array(0))
                );
                return {ok: true, status: upstream.status, contentType, text, truncated: total > FETCH_URL_MAX_BYTES};
            };
            try {
                let result = await fetchText(resolvedUrl);
                // GitHub ルートURL で main ブランチが 404 の場合 master を試みる
                if (!result.ok && ghRootMatch && resolvedUrl.includes('/main/README.md')) {
                    const masterUrl = resolvedUrl.replace('/main/README.md', '/master/README.md');
                    result = await fetchText(masterUrl);
                    if (result.ok) resolvedUrl = masterUrl;
                }
                if (!result.ok) {
                    if (result.binaryType) {
                        return Response.json(
                            {error: `binary content type: ${result.binaryType}`},
                            {status: 415, headers: cors.headers}
                        );
                    }
                    return Response.json(
                        {error: `upstream returned HTTP ${result.status}`},
                        {status: result.status, headers: cors.headers}
                    );
                }
                return Response.json(
                    {url: resolvedUrl, original_url: targetUrl, status: result.status, content_type: result.contentType, text: result.text, truncated: result.truncated},
                    {headers: cors.headers}
                );
            } catch (e) {
                return Response.json({error: `fetch failed: ${e.message}`}, {status: 502, headers: cors.headers});
            }
        }

        if (request.method !== 'POST' ||
            (url.pathname !== '/v1/chat/completions' && url.pathname !== '/chat/completions')) {
            return Response.json({error: 'not found'}, {status: 404, headers: cors.headers});
        }

        let body;
        try {
            body = await request.json();
        } catch {
            return Response.json({error: 'invalid json'}, {status: 400, headers: cors.headers});
        }

        if (!ALLOWED_MODELS.includes(body.model)) {
            return Response.json({error: 'model not allowed'}, {status: 400, headers: cors.headers});
        }
        body.max_tokens = Math.min(body.max_tokens || MAX_TOKENS_LIMIT, MAX_TOKENS_LIMIT);

        const upstream = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'authorization': `Bearer ${env.DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify(body)
        });

        return new Response(upstream.body, {
            status: upstream.status,
            headers: {
                ...cors.headers,
                'content-type': upstream.headers.get('content-type') || 'application/json',
                'cache-control': 'no-cache, no-transform'
            }
        });
    }
};
