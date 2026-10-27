# BRAINSTORM · app

O mapa mental das ideias do Leonardo (direção visual "Diagrama"), em três etapas: **Brainstorm** (mapa),
**Edição** (decidir a ideia) e **Kanban** (plano de ação em cartões). Site estático, sem build: abre no navegador,
lê e grava as ideias no repositório privado `leonardohfmarques-ship-it/brainstorm` pela API do GitHub.
O formato dos arquivos é o de `docs/FORMATO.md` daquele repositório; o vocabulário, o de `GLOSSARY.md`.

## Usar

1. Publicar este repositório no GitHub Pages (ramo `main`, pasta raiz). Endereço: `https://<usuario>.github.io/brainstorm-app/`.
2. Na primeira vez, o app pede uma chave (fine-grained token) só do repositório `brainstorm`, com
   **Contents: Read and write**. A chave fica só no navegador (localStorage `bs-token`) e só vai para `api.github.com`.
   “Sair” (menu Atalhos) apaga a chave.

Repositório, ramo e atalhos de produção ficam em `config.js`.

### Entrar com GitHub (opcional)

Com `login.worker` preenchido em `config.js`, a tela de entrada mostra o botão **Entrar com GitHub** (a chave colada
continua em "Usar uma chave"). Peças:

- **GitHub App** instalado só no repositório `brainstorm`, permissão Contents: Read and write, tokens que vencem
  (8 h + refresh token).
- **Worker** da Cloudflare (`worker/`): `/entrar` manda ao GitHub, `/callback` troca o code por token com o client
  secret (que só existe no Worker) e devolve ao app no fragmento `#bs_token=...`, `/renovar` troca o refresh token.
  Só devolve para `APP_URL` e `DEV_URL` (`worker/wrangler.toml`).
- **App** (`js/sessao.js`): lê o fragmento, guarda `bs-token`, `bs-refresh`, `bs-vence`, `bs-refresh-vence`, limpa a
  URL, renova 5 min antes de vencer e numa resposta 401. “Sair” apaga tudo.

Publicar o Worker: `cd worker && npx wrangler deploy`; segredo: `npx wrangler secret put GITHUB_CLIENT_SECRET`.

## Rodar no Mac (desenvolvimento)

    python3 dev-server.py            # http://127.0.0.1:8773/?local=1

Com `?local=1` o app lê a pasta `~/Desktop/BRAINSTORM` (servida em `/dados/`, só leitura) e grava apenas neste
navegador. “Descartar edições locais” (menu Atalhos) volta aos arquivos.

## Testes

    node --test testes/*.test.mjs

Ida e volta do formato (inclusive com os arquivos reais de `~/Desktop/BRAINSTORM/ideias`) e o backend do GitHub
contra uma API de mentira (sem token real): carregar, gravar, juntar mudanças, conflito, criar, sem conexão.
Seções Edição/Plano, estados, ordem das tarefas e apagar direção (GitHub de mentira e modo local).
Entrada com GitHub (fragmento, renovação, 401 → renova → repete, Worker vazio) e as rotas do Worker.

## Como grava

- Cada mudança reescreve só o campo ou a seção tocada; o resto do arquivo volta igual, byte a byte.
- Espera 800 ms sem mudanças e envia em fila, um arquivo por commit ("App: renomeia direção ...").
- Conflito (o Claude mexeu no arquivo ao mesmo tempo): busca de novo e reaplica só o que o app mudou.
- `pos` = deslocamento em relação à mãe, em unidades de um mapa de 1000 × 700. Áreas vão em `ideias/mapa-geral.json`.
  Arrastar direções reordena `ordem` pela volta no mapa (e as abas acompanham).
- Direção nova só vira arquivo quando o nome é confirmado (o slug da pasta nunca muda depois).
- Apagar direção: some da tela na hora ("Desfazer" por 8 s) e depois vai num commit só pela Git Data API
  (árvore nova sem a pasta, commit, ref sem forçar; se o ramo andou no meio, refaz por cima).
- Etapas: só a linha `estado` muda (ativa · edicao · kanban · feita · guardada). O Kanban grava as três colunas de
  `## Plano` de uma vez, cada tarefa um item `- texto`.

## Arquivos

    index.html  estilo.css  config.js
    js/app.js        interface (mapa, abas, painel, gaveta, atalhos, teclado, troca de etapa, apagar direção)
    js/etapas.js     páginas Edição e Kanban
    js/plano.js      tarefas do plano de ação (ler, escrever, mover)
    js/formato.js    frontmatter e seções do markdown
    js/modelo.js     arquivos → árvore de ideias e direções
    js/sync.js       fila de gravação, conflitos, indicador salvo/salvando
    js/github.js     backend de produção (API do GitHub)
    js/sessao.js     entrada com GitHub: token + refresh token, renovação
    worker/          Worker da Cloudflare do "Entrar com GitHub" (wrangler.toml, src/index.js)
    js/local.js      backend de desenvolvimento (?local=1)
    js/markdown.js   marked + DOMPurify, links e imagens de anexo
    dev-server.py    servidor local
