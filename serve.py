# 本地预览服务器。页面有 ~30 个 ES module 会同时请求，
# python -m http.server 默认的 listen 队列只有 5，偶尔会被重置连接，所以这里把队列调大。
import functools
import http.server
import os
import sys


class Server(http.server.ThreadingHTTPServer):
    request_queue_size = 128
    daemon_threads = True


port = int(sys.argv[1]) if len(sys.argv) > 1 else 5199
root = os.path.dirname(os.path.abspath(__file__))
handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=root)
print(f'http://127.0.0.1:{port}')
Server(('127.0.0.1', port), handler).serve_forever()
