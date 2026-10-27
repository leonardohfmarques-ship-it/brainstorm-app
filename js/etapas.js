// Etapas depois do Brainstorm: Edição (decidir a ideia) e Kanban (plano de ação em cartões).
// O Brainstorm (mapa) continua em app.js; aqui só as duas páginas novas, no mesmo visual Diagrama.
import { AREA } from './modelo.js';
import * as P from './plano.js';
import { md, hidratar } from './markdown.js';

const NOME = { brainstorm: 'Brainstorm', edicao: 'Edição', kanban: 'Kanban' };
export const nomeEtapa = e => NOME[e] || e;

export function criarEtapas(ctx) {
  const { esc, ICON, toast, linkar, fmtData, fmtDataBR, rebaixar, plural } = ctx;
  const UI = ctx.UI;
  const st = () => ctx.store();
  const M = () => st().model;
  const el = document.getElementById('etapa');
  const lista = e => M().ideias.filter(i => i.estado === e);
  const RM = window.matchMedia('(prefers-reduced-motion: reduce)');

  // estado da tela (não vai para o arquivo)
  let campoAberto = null;           // 'arquivo|seção' do campo em edição na página Edição
  const kb = { drag: null, editando: null, criando: null, foco: null };

  /* ---------------- lista lateral ---------------- */
  function itemHTML(i, sel, meta) {
    const a = AREA[i.area]; const on = i.key === sel;
    return `<li><button class="et-i${on ? ' is-sel' : ''}" data-key="${esc(i.key)}" style="--c:${a.c}"${on ? ' aria-current="true"' : ''}>
      <span class="bul">${esc(a.b)}</span><span class="t">${esc(i.titulo)}</span><span class="m">${esc(meta(i))}</span></button></li>`;
  }
  function ladoHTML(titulo, sub, grupos, sel, meta) {
    return `<aside class="et-lista" aria-label="Ideias em ${esc(titulo)}"><header class="et-lh"><h2>${esc(titulo)}</h2><p>${esc(sub)}</p></header>`
      + grupos.filter(g => g.itens.length || !g.nome).map(g => `${g.nome ? `<span class="lab et-gn">${esc(g.nome)} · ${g.itens.length}</span>` : ''}<ul>${g.itens.map(i => itemHTML(i, sel, meta)).join('')}</ul>`).join('')
      + `</aside>`;
  }
  function ligarLado(onPick) {
    el.querySelectorAll('.et-i').forEach(b => b.addEventListener('click', () => onPick(b.dataset.key)));
  }
  const vazioHTML = (titulo, texto, botao) => `<div class="et-corpo"><div class="et-vazio"><svg class="linhas" viewBox="0 0 320 60" aria-hidden="true"><path d="M0 44H120L150 14H320" fill="none" stroke="#111" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="2 14"/><circle cx="150" cy="14" r="9" fill="#fff" stroke="#111" stroke-width="4" stroke-dasharray="4 4"/></svg><h2>${esc(titulo)}</h2><p>${esc(texto)}</p>${botao ? `<button class="btn btn--solid" data-act="${botao.act}">${esc(botao.t)}</button>` : ''}</div></div>`;

  function metaIdeia(i, extra) {
    return `<p class="pmeta">${i.codigo ? `<b>${esc(i.codigo)}</b>` : ''}<span>${esc(ctx.areaNome(i.area))}</span>${extra.map(x => `<span>${esc(x)}</span>`).join('')}${i.criada ? `<span>criada ${fmtData(i.criada)}</span>` : ''}</p>`;
  }

  /* ---------------- campo de markdown editável (Escolhas, Versão final, Anotações) ---------------- */
  function campoHTML(id, texto, base, vazio, nota) {
    if (campoAberto === id) {
      return `<textarea class="cru" data-campo="${esc(id)}" spellcheck="true" aria-label="Editar em markdown">${esc(texto)}</textarea>
        <div class="cru-bar"><button class="btn btn--sm btn--solid" data-fecha="${esc(id)}">Pronto</button><small>${esc(nota || 'Salva sozinho enquanto escreves.')}</small></div>`;
    }
    return texto.trim()
      ? `<div class="campo-v" role="button" tabindex="0" data-abre="${esc(id)}" aria-label="Editar"><div class="md">${md(texto, base, ctx.backend())}</div></div>`
      : `<button class="campo-vazio" data-abre="${esc(id)}">${esc(vazio)}</button>`;
  }
  function ligarCampos(defs, rerender) {
    el.querySelectorAll('[data-abre]').forEach(b => {
      const abrir = e => { if (e.target.closest && e.target.closest('a')) return; campoAberto = b.dataset.abre; rerender(); const t = el.querySelector(`[data-campo="${CSS.escape(campoAberto)}"]`); if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); } };
      b.addEventListener('click', abrir);
      b.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(e); } });
    });
    el.querySelectorAll('[data-campo]').forEach(t => {
      const d = defs[t.dataset.campo]; if (!d) return;
      t.addEventListener('input', () => st().remendar(d.file, { sec: { [d.sec]: rebaixar(t.value, 4) } }, d.msg));
    });
    el.querySelectorAll('[data-fecha]').forEach(b => b.addEventListener('click', () => { campoAberto = null; rerender(); }));
  }

  /* ---------------- Edição ---------------- */
  function renderEdicao() {
    const ideias = lista('edicao');
    const i = ideias.find(x => x.key === UI.ed) || ideias[0];
    if (i && UI.ed !== i.key) { UI.ed = i.key; ctx.saveUI(); }
    const metaLista = x => {
      const n = P.total(x.plano);
      return n ? `plano · ${plural(n, 'tarefa', 'tarefas')}` : x.edicao.escolhas.trim() ? 'escolhas feitas' : 'falta escolher';
    };
    const lado = ladoHTML('Edição', ideias.length ? `${plural(ideias.length, 'ideia', 'ideias')} decidindo` : 'nada em edição', [{ itens: ideias }], i && i.key, metaLista);
    if (!i) {
      el.innerHTML = lado + vazioHTML('Nada em edição', 'No Brainstorm, abre uma ideia e usa “Decidir → Edição”. Depois, no chat do Claude Code, diz “lapidar”.', { act: 'ir-bs', t: 'Ir ao Brainstorm' });
      el.querySelector('[data-act="ir-bs"]').addEventListener('click', () => ctx.irPara('brainstorm'));
      return;
    }
    if (campoAberto && !campoAberto.startsWith(i.file + '|')) campoAberto = null;
    const a = AREA[i.area];
    const n = P.total(i.plano);
    const escolhas = i.edicao.escolhas, versao = i.edicao.versao;
    const id = s => i.file + '|' + s;
    let h = `<div class="et-corpo" style="--c:${a.c}"><div class="et-in">`;
    h += `<header class="et-h">${metaIdeia(i, ['em edição'])}<h1 class="ph">${esc(i.titulo)}</h1>
      <div class="actions">
        <button class="btn btn--sm" data-act="voltar-bs" title="A ideia volta para o mapa do Brainstorm">${ICON.back}Voltar ao Brainstorm</button>
        <button class="btn btn--sm btn--solid" data-act="kanban"${n ? '' : ' disabled'} title="${n ? 'As tarefas entram em A fazer' : 'Primeiro o plano: ele nasce no chat'}">${ICON.kanban}Mandar pro Kanban</button>
      </div></header>`;
    if (!escolhas.trim()) {
      h += `<div class="aviso" role="note"><span class="lab">Falta escolher</span>
        <p>Escolhe no chat do Claude Code:</p>
        <div class="cmd"><code>lapidar ${esc(i.titulo)}</code><button class="btn btn--sm" data-act="copiar">${ICON.link}Copiar</button></div>
        <small>O Claude pergunta quais direções ficam, formato e canal, prazo e ritmo. Depois escreve a versão final e o plano de ação.</small></div>`;
    }
    h += `<div class="ed-grid"><div class="ed-col"><h2 class="ed-t">Decisão</h2>`;
    h += `<section class="layer esc" aria-labelledby="lEsc"><header class="layer-h"><b id="lEsc">Escolhas</b><span>o que fica</span><span class="sp"></span>${campoAberto !== id('esc') && escolhas.trim() ? `<button class="mini" data-abre="${esc(id('esc'))}">editar</button>` : ''}</header><div class="layer-b">`
      + campoHTML(id('esc'), escolhas, i.base, 'Ainda vazio. Escolhe no chat, ou escreve aqui à mão.', 'Uma linha por escolha: "- Formato: Reel de 30 s".') + `</div></section>`;
    h += `<section class="layer lap" aria-labelledby="lVer"><header class="layer-h"><b id="lVer">Versão final</b><span>do Claude</span><span class="sp"></span>${campoAberto !== id('ver') && versao.trim() ? `<button class="mini" data-abre="${esc(id('ver'))}">editar</button>` : ''}</header><div class="layer-b">`
      + campoHTML(id('ver'), versao, i.base, 'Ainda sem versão final. O Claude escreve no fim da Edição.', 'Títulos aqui começam com ####.') + `</div></section>`;
    h += `<section class="layer plano" aria-labelledby="lPl"><header class="layer-h"><b id="lPl">Plano de ação</b><span>${n ? plural(n, 'tarefa', 'tarefas') : 'nasce no chat'}</span></header><div class="layer-b">`;
    if (!n) h += `<p class="empty">O plano nasce no chat, no fim da Edição: de 5 a 12 tarefas em ordem, a primeira dá para fazer hoje.</p>`;
    else {
      let k = 0;
      for (const c of P.COLUNAS) {
        const ts = i.plano[c.id].tarefas; if (!ts.length) continue;
        h += `<span class="lab">${esc(c.nome)} · ${ts.length}</span><ol class="plano-l" start="${k + 1}">${ts.map(t => `<li>${linkar(t.texto)}</li>`).join('')}</ol>`;
        k += ts.length;
      }
      h += `<small class="nota">Revisa aqui; quando estiver bom, “Mandar pro Kanban”.</small>`;
    }
    h += `</div></section></div>`;
    // de onde veio
    h += `<div class="ed-col"><h2 class="ed-t">De onde veio</h2>`;
    h += `<section class="layer bruto" aria-labelledby="lBr"><header class="layer-h"><b id="lBr">Bruto</b><span>teu · intacto</span></header><div class="layer-b">`;
    const fala = i.fala;
    h += `<span class="lab">Fala${fala.data ? ' · ' + esc(fmtDataBR(fala.data)) : ''}</span>`;
    h += fala.falas.length ? fala.falas.map(t => `<blockquote class="fala sm-ed">${linkar(t)}</blockquote>`).join('') : `<p class="empty" style="color:var(--gray)">Sem fala registrada.</p>`;
    h += `<span class="lab">Tuas anotações</span>` + campoHTML(id('notas'), i.anotacoes, i.base, 'Escreve aqui. Só tu mexes neste campo.', 'Só tu mexes neste campo.');
    h += `</div></section>`;
    if (i.lapidado.trim()) h += `<details class="layer lap dobra"><summary class="layer-h"><b>Lapidado</b><span>do Claude</span><span class="sp"></span><span class="mini">abrir</span></summary><div class="layer-b"><div class="md">${md(i.lapidado, i.base, ctx.backend())}</div></div></details>`;
    h += `<section class="layer dirs" aria-labelledby="lDi"><header class="layer-h"><b id="lDi">Direções</b><span>${i.direcoes.length ? plural(i.direcoes.length, 'restou', 'restaram') : 'nenhuma'}</span></header><div class="layer-b">`;
    if (!i.direcoes.length) h += `<p class="empty">Nenhuma direção. Tudo bem: a versão final pode sair direto da ideia.</p>`;
    else h += `<ul class="ed-dirs">${i.direcoes.map((d, k) => {
      const resumo = d.lapidado.replace(/^#+.*$/gm, '').replace(/\s+/g, ' ').trim();
      const dentro = d.direcoes.length ? ` · ${d.direcoes.length} dentro` : '';
      return `<li style="--c:${a.c}"><span class="bul">${String.fromCharCode(65 + (k % 26))}</span><div><b>${esc(d.titulo)}</b><small>${esc(resumo.slice(0, 170))}${resumo.length > 170 ? '…' : ''}${esc(dentro)}</small></div>
        <button class="btn btn--sm btn--ghost btn--perigo" data-apaga="${esc(d.slug)}" aria-label="Apagar a direção ${esc(d.titulo)}" title="Apagar (dá para desfazer)">${ICON.trash}</button></li>`;
    }).join('')}</ul>`;
    h += `</div></section></div></div></div></div>`;
    const scroll = el.querySelector('.et-corpo') ? el.querySelector('.et-corpo').scrollTop : 0;
    el.innerHTML = lado + h;
    hidratar(el, ctx.backend());
    const corpo = el.querySelector('.et-corpo'); if (corpo) corpo.scrollTop = scroll;
    ligarLado(k => { UI.ed = k; campoAberto = null; ctx.saveUI(); renderEdicao(); el.querySelector('.et-corpo').scrollTop = 0; });
    ligarCampos({
      [id('esc')]: { file: i.file, sec: 'Edição/Escolhas', msg: `App: escolhas de "${i.titulo}"` },
      [id('ver')]: { file: i.file, sec: 'Edição/Versão final', msg: `App: edita a versão final de "${i.titulo}"` },
      [id('notas')]: { file: i.file, sec: 'Bruto/Anotações', msg: `App: anotações em "${i.titulo}"` }
    }, renderEdicao);
    el.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', async () => {
      const act = b.dataset.act;
      if (act === 'voltar-bs') ctx.mudarEstado(i, 'ativa');
      if (act === 'kanban' && n) ctx.mudarEstado(i, 'kanban');
      if (act === 'copiar') {
        try { await navigator.clipboard.writeText('lapidar ' + i.titulo); toast('Copiado. Cola no chat do Claude Code.'); }
        catch (e) { toast('Não deu para copiar. Escreve no chat: lapidar ' + i.titulo); }
      }
    }));
    el.querySelectorAll('[data-apaga]').forEach(b => b.addEventListener('click', () => {
      const d = i.direcoes.find(x => x.slug === b.dataset.apaga); if (d) ctx.apagarDirecao(d);
    }));
  }

  /* ---------------- Kanban ---------------- */
  function renderKanban() {
    const ativas = lista('kanban'), feitas = lista('feita');
    const todas = ativas.concat(feitas);
    const i = todas.find(x => x.key === UI.kb) || todas[0];
    if (i && UI.kb !== i.key) { UI.kb = i.key; ctx.saveUI(); }
    const metaLista = x => { const n = P.total(x.plano); return n ? `${x.plano.feito.tarefas.length} de ${n} feitas` : 'sem tarefas'; };
    const lado = ladoHTML('Kanban', ativas.length ? `${plural(ativas.length, 'ideia', 'ideias')} em ação` : 'nada em ação', [{ itens: ativas }, { nome: 'Concluídas', itens: feitas }], i && i.key, metaLista);
    if (!i) {
      el.innerHTML = lado + vazioHTML('Nada no Kanban', 'Na Edição, quando o plano estiver pronto, usa “Mandar pro Kanban”. As tarefas aparecem aqui em A fazer.', { act: 'ir-ed', t: 'Ir à Edição' });
      el.querySelector('[data-act="ir-ed"]').addEventListener('click', () => ctx.irPara('edicao'));
      return;
    }
    const a = AREA[i.area];
    const plano = i.plano;
    const n = P.total(plano), feitos = plano.feito.tarefas.length;
    const feita = i.estado === 'feita';
    const pct = n ? Math.round(feitos / n * 100) : 0;
    let h = `<div class="et-corpo kb" style="--c:${a.c}"><div class="et-in et-in--kb">`;
    h += `<header class="et-h">${metaIdeia(i, [feita ? 'concluída' : 'no kanban', n ? `${feitos} de ${n} feitas` : 'sem tarefas'])}<h1 class="ph">${esc(i.titulo)}</h1>
      <div class="prog" role="progressbar" aria-label="Tarefas feitas" aria-valuemin="0" aria-valuemax="${n}" aria-valuenow="${feitos}"><span style="width:${pct}%"></span></div>
      <div class="actions">
        <button class="btn btn--sm" data-act="voltar-ed">${ICON.back}Voltar para Edição</button>
        ${feita ? `<button class="btn btn--sm btn--solid" data-act="reabrir">${ICON.kanban}Reabrir no Kanban</button>`
          : `<button class="btn btn--sm${n && feitos === n ? ' btn--solid' : ''}" data-act="concluir"${n && feitos === n ? '' : ' disabled'} title="${n && feitos === n ? 'Tudo feito: marca a ideia como concluída' : 'Libera quando tudo estiver em Feito'}">${ICON.check}Concluir ideia</button>`}
      </div></header>`;
    h += `<div class="board" id="board">`;
    P.COLUNAS.forEach((c, ci) => {
      const ts = plano[c.id].tarefas;
      h += `<section class="col col--${c.id}" data-col="${c.id}" aria-labelledby="col-${c.id}">
        <header class="col-h"><span class="col-d" aria-hidden="true"></span><h2 id="col-${c.id}">${esc(c.nome)}</h2><span class="count">${ts.length}</span></header>
        <ol class="col-b" data-col="${c.id}">`;
      ts.forEach((t, k) => {
        const ed = kb.editando && kb.editando.col === c.id && kb.editando.i === k;
        const extra = (t.extra || []).join('\n').trim();
        h += `<li class="card${ed ? ' is-ed' : ''}" tabindex="0" data-col="${c.id}" data-i="${k}" aria-label="${esc(t.texto)}. ${esc(c.nome)}, ${k + 1} de ${ts.length}. Alt e setas movem, Enter edita, Delete apaga.">
          <span class="card-d" aria-hidden="true"></span><div class="card-c">`
          + (ed ? `<textarea class="card-in" data-edita aria-label="Texto da tarefa" maxlength="300">${esc(t.texto)}</textarea>`
                : `<div class="card-t">${linkar(t.texto)}</div>${extra ? `<div class="card-x">${linkar(extra)}</div>` : ''}`)
          + `<div class="card-b" role="toolbar" aria-label="Tarefa">
              <button data-k="esq"${ci === 0 ? ' disabled' : ''} aria-label="Mover para ${esc(ci ? P.COLUNAS[ci - 1].nome : '')}" title="Coluna anterior (Alt ←)">${ICON.esq}</button>
              <button data-k="cima"${k === 0 ? ' disabled' : ''} aria-label="Subir" title="Subir (Alt ↑)">${ICON.cima}</button>
              <button data-k="baixo"${k === ts.length - 1 ? ' disabled' : ''} aria-label="Descer" title="Descer (Alt ↓)">${ICON.baixo}</button>
              <button data-k="dir"${ci === P.COLUNAS.length - 1 ? ' disabled' : ''} aria-label="Mover para ${esc(ci < 2 ? P.COLUNAS[ci + 1].nome : '')}" title="Próxima coluna (Alt →)">${ICON.dir}</button>
              <span class="sp"></span>
              <button data-k="editar" aria-label="Editar o texto" title="Editar (Enter)">${ICON.pen}</button>
              <button data-k="apagar" class="perigo" aria-label="Apagar a tarefa" title="Apagar (Delete)">${ICON.x}</button>
            </div></div></li>`;
      });
      if (kb.criando === c.id) h += `<li class="card card--novo"><span class="card-d" aria-hidden="true"></span><div class="card-c"><textarea class="card-in" data-cria="${c.id}" placeholder="Nova tarefa… (Enter cria, Esc fecha)" aria-label="Nova tarefa em ${esc(c.nome)}" maxlength="300"></textarea></div></li>`;
      h += `</ol><button class="col-add" data-add="${c.id}">${ICON.plus}Tarefa</button></section>`;
    });
    h += `</div><p class="kb-dica"><span>arrasta os cartões</span><span>Alt + setas move</span><span>Enter edita</span><span>Delete apaga</span></p></div></div>`;
    const scroll = el.querySelector('.et-corpo') ? el.querySelector('.et-corpo').scrollTop : 0;
    el.innerHTML = lado + h;
    const corpo = el.querySelector('.et-corpo'); if (corpo) corpo.scrollTop = scroll;
    ligarLado(k => { UI.kb = k; kb.editando = kb.criando = null; ctx.saveUI(); renderKanban(); });
    el.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
      const act = b.dataset.act;
      if (act === 'voltar-ed') ctx.mudarEstado(i, 'edicao');
      if (act === 'concluir' && n && feitos === n) ctx.mudarEstado(i, 'feita');
      if (act === 'reabrir') ctx.mudarEstado(i, 'kanban');
    }));
    ligarQuadro(i);
    // foco depois de mover / criar / editar
    if (kb.criando) { const t = el.querySelector('[data-cria]'); if (t) t.focus(); }
    else if (kb.editando) { const t = el.querySelector('[data-edita]'); if (t) { t.focus(); t.select(); } }
    else if (kb.foco) {
      const c = el.querySelector(`.card[data-col="${kb.foco.col}"][data-i="${kb.foco.i}"]`) || el.querySelector(`[data-add="${kb.foco.col}"]`);
      if (c) c.focus({ preventScroll: false });
      kb.foco = null;
    }
  }

  // grava o plano inteiro (as três colunas) e redesenha
  function gravar(i, novo, msg, foco) {
    st().remendar(i.file, P.remendo(novo), msg);
    if (foco) kb.foco = foco;
    renderKanban(); ctx.renderNav();
  }
  const ideiaKb = () => M().ideias.find(x => x.key === UI.kb);
  const idxCol = id => P.COLUNAS.findIndex(c => c.id === id);

  function moverPor(i, col, k, acao) {
    const ci = idxCol(col), ts = i.plano[col].tarefas;
    const t = ts[k]; if (!t) return;
    let para = null;
    if (acao === 'cima' && k > 0) para = { col, i: k - 1 };
    if (acao === 'baixo' && k < ts.length - 1) para = { col, i: k + 1 };
    if (acao === 'esq' && ci > 0) { const c2 = P.COLUNAS[ci - 1].id; para = { col: c2, i: i.plano[c2].tarefas.length }; }
    if (acao === 'dir' && ci < P.COLUNAS.length - 1) { const c2 = P.COLUNAS[ci + 1].id; para = { col: c2, i: i.plano[c2].tarefas.length }; }
    if (!para) return;
    const msg = para.col === col ? `App: reordena o plano de "${i.titulo}"` : `App: tarefa de "${i.titulo}" vai para ${P.COLUNAS[idxCol(para.col)].nome}`;
    gravar(i, P.mover(i.plano, { col, i: k }, para), msg, para);
  }
  function apagarTarefa(i, col, k) {
    const t = i.plano[col].tarefas[k]; if (!t) return;
    const antes = P.copiar(i.plano);
    gravar(i, P.apagar(i.plano, col, k), `App: apaga uma tarefa de "${i.titulo}"`, { col, i: Math.max(0, k - 1) });
    toast(`Tarefa apagada: “${t.texto.slice(0, 40)}${t.texto.length > 40 ? '…' : ''}”`, { acao: 'Desfazer', ms: 7000, fn: () => {
      const j = M().ideias.find(x => x.key === i.key); if (!j) return;
      // volta no lugar (as outras mudanças feitas depois continuam)
      const novo = P.copiar(j.plano); novo[col].tarefas.splice(Math.min(k, novo[col].tarefas.length), 0, antes[col].tarefas[k]);
      gravar(j, novo, `App: desfaz apagar tarefa de "${i.titulo}"`, { col, i: k });
    } });
  }

  function ligarQuadro(i) {
    const board = el.querySelector('#board'); if (!board) return;
    // botões do cartão
    board.addEventListener('click', e => {
      const add = e.target.closest('[data-add]');
      if (add) { kb.criando = add.dataset.add; kb.editando = null; renderKanban(); return; }
      const b = e.target.closest('.card-b button'); if (!b) return;
      const card = b.closest('.card'); const col = card.dataset.col, k = +card.dataset.i;
      const acao = b.dataset.k;
      if (acao === 'editar') { kb.editando = { col, i: k }; kb.criando = null; renderKanban(); }
      else if (acao === 'apagar') apagarTarefa(i, col, k);
      else moverPor(i, col, k, acao);
    });
    board.addEventListener('dblclick', e => {
      const card = e.target.closest('.card'); if (!card || card.classList.contains('card--novo') || e.target.closest('textarea, button')) return;
      kb.editando = { col: card.dataset.col, i: +card.dataset.i }; renderKanban();
    });
    // teclado no cartão
    board.addEventListener('keydown', e => {
      const card = e.target.closest('.card'); if (!card || e.target !== card) return;
      const col = card.dataset.col, k = +card.dataset.i, ci = idxCol(col);
      const setas = { ArrowUp: 'cima', ArrowDown: 'baixo', ArrowLeft: 'esq', ArrowRight: 'dir' };
      if (e.altKey && setas[e.key]) { e.preventDefault(); moverPor(i, col, k, setas[e.key]); return; }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); kb.editando = { col, i: k }; renderKanban(); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); e.stopPropagation(); apagarTarefa(i, col, k); }
      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const alvo = board.querySelector(`.card[data-col="${col}"][data-i="${k + (e.key === 'ArrowUp' ? -1 : 1)}"]`); if (alvo) alvo.focus();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const c2 = P.COLUNAS[ci + (e.key === 'ArrowLeft' ? -1 : 1)]; if (!c2) return;
        const cards = board.querySelectorAll(`.card[data-col="${c2.id}"]:not(.card--novo)`);
        const alvo = cards[Math.min(k, cards.length - 1)] || board.querySelector(`[data-add="${c2.id}"]`); if (alvo) alvo.focus();
      }
    });
    // editar texto
    const ed = board.querySelector('[data-edita]');
    if (ed) {
      let feito = false;
      const salvar = ok => {
        if (feito) return; feito = true;
        const { col, i: k } = kb.editando; kb.editando = null;
        const v = ed.value.replace(/\s+/g, ' ').trim();
        if (ok && v && v !== i.plano[col].tarefas[k].texto) gravar(i, P.editar(i.plano, col, k, v), `App: edita uma tarefa de "${i.titulo}"`, { col, i: k });
        else { kb.foco = { col, i: k }; renderKanban(); }
      };
      ed.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); salvar(true); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); salvar(false); }
      });
      ed.addEventListener('blur', () => setTimeout(() => salvar(true), 0));
    }
    // criar tarefa
    const cr = board.querySelector('[data-cria]');
    if (cr) {
      let feito = false;
      const criar = (fica) => {
        if (feito) return; feito = true;
        const col = cr.dataset.cria; const v = cr.value.replace(/\s+/g, ' ').trim();
        kb.criando = fica && v ? col : null;
        if (v) gravar(i, P.criar(i.plano, col, v), `App: cria uma tarefa em "${i.titulo}"`, fica ? null : { col, i: i.plano[col].tarefas.length });
        else { kb.foco = { col, i: Math.max(0, i.plano[col].tarefas.length - 1) }; renderKanban(); }
      };
      cr.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); criar(true); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cr.value = ''; criar(false); }
      });
      cr.addEventListener('blur', () => setTimeout(() => criar(false), 0));
    }
    // arrastar (ponteiro): o próprio cartão vira o lugar vazio e um fantasma segue o mouse
    board.addEventListener('pointerdown', e => {
      const card = e.target.closest('.card');
      if (!card || card.classList.contains('card--novo') || e.button !== 0 || kb.editando) return;
      if (e.target.closest('button, textarea, input, a')) return;
      if (e.pointerType !== 'mouse' && !e.target.closest('.card-d')) return; // no toque, arrasta pela bolinha
      kb.drag = { card, i, de: { col: card.dataset.col, i: +card.dataset.i }, x0: e.clientX, y0: e.clientY, movido: false, pid: e.pointerId };
    });
  }
  window.addEventListener('pointermove', e => {
    const d = kb.drag; if (!d) return;
    if (!d.movido) {
      if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 5) return;
      d.movido = true;
      const r = d.card.getBoundingClientRect();
      d.dx = e.clientX - r.left; d.dy = e.clientY - r.top;
      d.fantasma = d.card.cloneNode(true); d.fantasma.classList.add('card--fantasma'); d.fantasma.removeAttribute('tabindex');
      d.fantasma.style.width = r.width + 'px';
      document.body.appendChild(d.fantasma);
      d.card.classList.add('is-vaga');
      document.body.classList.add('is-arrastando');
    }
    e.preventDefault();
    d.fantasma.style.transform = `translate(${e.clientX - d.dx}px, ${e.clientY - d.dy}px) rotate(${RM.matches ? 0 : -1.5}deg)`;
    // coluna pelo x, posição pelo y
    const cols = [...el.querySelectorAll('.col-b')];
    let alvo = cols.find(c => { const r = c.parentElement.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right; });
    if (!alvo) alvo = cols.reduce((m, c) => { const r = c.parentElement.getBoundingClientRect(); const dist = Math.abs(e.clientX - (r.left + r.width / 2)); return !m || dist < m.d ? { c, d: dist } : m; }, null).c;
    const outros = [...alvo.querySelectorAll('.card:not(.is-vaga):not(.card--novo)')];
    const antes = outros.find(c => { const r = c.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
    if (antes) { if (d.card.nextElementSibling !== antes || d.card.parentElement !== alvo) alvo.insertBefore(d.card, antes); }
    else { const novo = alvo.querySelector('.card--novo'); if (novo) alvo.insertBefore(d.card, novo); else if (d.card.parentElement !== alvo || d.card.nextElementSibling) alvo.appendChild(d.card); }
    el.querySelectorAll('.col').forEach(c => c.classList.toggle('is-alvo', c.contains(d.card)));
  });
  const fimArrasto = () => {
    const d = kb.drag; if (!d) return;
    kb.drag = null;
    if (!d.movido) return;
    d.fantasma.remove(); document.body.classList.remove('is-arrastando');
    const col = d.card.parentElement.dataset.col;
    const k = [...d.card.parentElement.querySelectorAll('.card:not(.card--novo)')].indexOf(d.card);
    const i = M().ideias.find(x => x.key === d.i.key) || d.i;
    if (col === d.de.col && k === d.de.i) { kb.foco = d.de; renderKanban(); return; }
    const msg = col === d.de.col ? `App: reordena o plano de "${i.titulo}"` : `App: tarefa de "${i.titulo}" vai para ${P.COLUNAS[idxCol(col)].nome}`;
    gravar(i, P.mover(i.plano, d.de, { col, i: k }), msg, { col, i: k });
  };
  window.addEventListener('pointerup', fimArrasto);
  window.addEventListener('pointercancel', fimArrasto);

  function render() {
    el.hidden = false;
    if (UI.etapa === 'edicao') renderEdicao(); else renderKanban();
  }
  return {
    render,
    ocupado: () => !!kb.drag || !!kb.editando || !!kb.criando,
    contar: e => lista(e).length,
    soltar: () => { kb.editando = kb.criando = null; campoAberto = null; },
    ideiaAberta: () => UI.etapa === 'edicao' ? M().ideias.find(x => x.key === UI.ed && x.estado === 'edicao') : ideiaKb()
  };
}
