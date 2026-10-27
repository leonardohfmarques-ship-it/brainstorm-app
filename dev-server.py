#!/usr/bin/env python3
"""Servidor de desenvolvimento do app BRAINSTORM.

Serve o app (esta pasta) e, em /dados/, a pasta BRAINSTORM só para leitura (o LocalBackend lê daí com ?local=1).
Uso: python3 dev-server.py [porta] [pasta-brainstorm]
"""
import os
import sys
import urllib.parse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

APP = os.path.dirname(os.path.abspath(__file__))
PORTA = int(sys.argv[1]) if len(sys.argv) > 1 else 8773
DADOS = os.path.abspath(os.path.expanduser(sys.argv[2] if len(sys.argv) > 2 else '~/Desktop/BRAINSTORM'))


class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        caminho = urllib.parse.urlsplit(path).path
        if caminho == '/dados' or caminho.startswith('/dados/'):
            resto = caminho[len('/dados'):]
            base = DADOS
        else:
            resto = caminho
            base = APP
        partes = [p for p in urllib.parse.unquote(resto).split('/') if p and p not in ('.', '..')]
        return os.path.join(base, *partes)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    # só leitura: nada de gravar nos arquivos de verdade
    def do_PUT(self):
        self.send_error(405, 'Somente leitura')

    do_POST = do_DELETE = do_PATCH = do_PUT

    def log_message(self, fmt, *args):
        pass


if __name__ == '__main__':
    servidor = ThreadingHTTPServer(('127.0.0.1', PORTA), partial(Handler, directory=APP))
    print(f'BRAINSTORM app em http://127.0.0.1:{PORTA}/?local=1  (dados: {DADOS})', flush=True)
    servidor.serve_forever()
