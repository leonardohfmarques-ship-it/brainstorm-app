# BRAINSTORM · app

O mapa mental das ideias do Leonardo (direção visual "Diagrama"). Site estático, sem build: abre no navegador,
lê e grava as ideias no repositório privado `leonardohfmarques-ship-it/brainstorm` pela API do GitHub.
O formato dos arquivos é o de `docs/FORMATO.md` daquele repositório; o vocabulário, o de `GLOSSARY.md`.

## Usar

1. Publicar este repositório no GitHub Pages (ramo `main`, pasta raiz). Endereço: `https://<usuario>.github.io/brainstorm-app/`.
2. Na primeira vez, o app pede uma chave (fine-grained token) só do repositório `brainstorm`, com
   **Contents: Read and write**. A chave fica só no navegador (localStorage `bs-token`) e só vai para `api.github.com`.
   “Sair” (menu Atalhos) apaga a chave.

Repositório, ramo e atalhos de produção ficam em `config.js`.

## Rodar no Mac (desenvolvimento)

    python3 dev-server.py            # http://127.0.0.1:8773/?local=1

Com `?local=1` o app lê a pasta `~/Desktop/BRAINSTORM` (servida em `/dados/`, só leitura) e grava apenas neste
navegador. “Descartar edições locais” (menu Atalhos) volta aos arquivos.

## Testes

    node --test testes/*.test.mjs

Ida e volta do formato (inclusive com os arquivos reais de `~/Desktop/BRAINSTORM/ideias`) e o backend do GitHub
contra uma API de mentira (sem token real): carregar, gravar, juntar mudanças, conflito, criar, sem conexão.

## Como grava

- Cada mudança reescreve só o campo ou a seção tocada; o resto do arquivo volta igual, byte a byte.
- Espera 800 ms sem mudanças e envia em fila, um arquivo por commit ("App: renomeia direção ...").
- Conflito (o Claude mexeu no arquivo ao mesmo tempo): busca de novo e reaplica só o que o app mudou.
- `pos` = deslocamento em relação à mãe, em unidades de um mapa de 1000 × 700. Áreas vão em `ideias/mapa-geral.json`.
  Arrastar direções reordena `ordem` pela volta no mapa (e as abas acompanham).
- Direção nova só vira arquivo quando o nome é confirmado (o slug da pasta nunca muda depois).

## Arquivos

    index.html  estilo.css  config.js
    js/app.js        interface (mapa, abas, painel, gaveta, atalhos, teclado)
    js/formato.js    frontmatter e seções do markdown
    js/modelo.js     arquivos → árvore de ideias e direções
    js/sync.js       fila de gravação, conflitos, indicador salvo/salvando
    js/github.js     backend de produção (API do GitHub)
    js/local.js      backend de desenvolvimento (?local=1)
    js/markdown.js   marked + DOMPurify, links e imagens de anexo
    dev-server.py    servidor local
