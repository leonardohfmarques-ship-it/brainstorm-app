// Etapas depois do Brainstorm: Edição (decidir a ideia) e Kanban (plano de ação em cartões).
// O Brainstorm (mapa) continua em app.js; aqui só as duas páginas novas, no mesmo visual Diagrama.
import { AREA } from './modelo.js';
import * as P from './plano.js';
import * as I from './item.js';
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
  function campoHTML(id, texto, base, vazio, nota, ver) {
    if (campoAberto === id) {
      return `<textarea class="cru" data-campo="${esc(id)}" spellcheck="true" aria-label="Editar em markdown">${esc(texto)}</textarea>
        <div class="cru-bar"><button class="btn btn--sm btn--solid" data-fecha="${esc(id)}">Pronto</button><small>${esc(nota || 'Salva sozinho enquanto escreves.')}</small></div>`;
    }
    return texto.trim()
      ? `<div class="campo-v" role="button" tabindex="0" data-abre="${esc(id)}" aria-label="Editar">${ver ? ver(texto) : `<div class="md">${md(texto, base, ctx.backend())}</div>`}</div>`
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
      t.addEventListener('input', () => st().remendar(d.file, { sec: { [d.sec]: rebaixar(t.value, d.min || 4) } }, d.msg));
    });
    el.querySelectorAll('[data-fecha]').forEach(b => b.addEventListener('click', () => { campoAberto = null; rerender(); }));
  }

  /* ---------------- Edição ----------------
     Cada item é uma direção (ou ideia) decidida, com o contexto herdado e as ferramentas. As ideias que ainda
     estão no jeito antigo (a ideia inteira com estado "edicao") aparecem num grupo à parte, como eram. */
  const itensEm = e => M().itens.filter(x => x.estado === e);
  const porKey = k => M().ideias.find(x => x.key === k) || M().itens.find(x => x.key === k);
  const prontas = it => I.PRINCIPAIS.filter(f => I.estadoFerramenta(it, f) === 'pronto').length;
  let ctxAberto = false;              // o contexto herdado começa recolhido
  const nivAberto = new Set();        // níveis do contexto abertos (a ponta abre sozinha)
  let extrasAberto = false;           // Extras (Referências e Comparar) começam recolhidos
  let novaAberta = false, descAberto = false; // Perguntas: "pergunta minha" e "Descartadas" começam fechadas
  function ligarLadoEd() { ligarLado(k => { UI.ed = k; campoAberto = null; ctx.saveUI(); renderEdicao(); el.querySelector('.et-corpo').scrollTop = 0; }); }

  function renderEdicao() {
    const itens = itensEm('edicao'), antigas = lista('edicao');
    const todos = itens.concat(antigas);
    const i = todos.find(x => x.key === UI.ed) || todos[0];
    if (i && UI.ed !== i.key) { UI.ed = i.key; ctx.saveUI(); }
    const metaLista = x => {
      if (x.kind === 'item') { const em = x.pedidos.length ? ' · Claude escrevendo' : ''; return `${x.codigo ? x.codigo + ' · ' : ''}${I.PASSO[x.passo].nome} · ${prontas(x)} de ${I.PRINCIPAIS.length} prontas${em}`; }
      const n = P.total(x.plano);
      return n ? `plano · ${plural(n, 'tarefa', 'tarefas')}` : x.edicao.escolhas.trim() ? 'escolhas feitas' : 'falta escolher';
    };
    const sub = todos.length ? plural(todos.length, 'decidida', 'decididas') : 'nada em edição';
    const lado = ladoHTML('Edição', sub, [{ itens }, { nome: 'Ideia inteira (jeito antigo)', itens: antigas }], i && i.key, metaLista);
    if (!i) {
      el.innerHTML = lado + vazioHTML('Nada em edição', 'No Brainstorm, escolhe a direção que vale (de qualquer nível) e usa “Decidir → Edição”. Ela chega aqui com o caminho até ela.', { act: 'ir-bs', t: 'Ir ao Brainstorm' });
      el.querySelector('[data-act="ir-bs"]').addEventListener('click', () => ctx.irPara('brainstorm'));
      return;
    }
    if (i.kind === 'item') renderItem(i, lado); else renderAntiga(i, lado);
  }

  /* ----- "Enviar respostas": liga quando há resposta nova ou mudada (ou o rumo mudou) desde o último envio ----- */
  function envioHTML(nv) {
    const partes = [];
    if (nv.respostas) partes.push(nv.respostas === 1 ? '1 nova' : `${nv.respostas} novas`);
    if (nv.rumo) partes.push(nv.respostas ? 'e o rumo' : 'o rumo mudou');
    const dica = nv.algo ? 'O Claude lê, diz o que entendeu e ajusta as sugestões. Não mexe no que tu escreveste.'
      : nv.nunca ? 'Responde pelo menos uma' : 'Nada novo desde o último envio';
    return `<button class="btn btn--sm btn--solid" data-envia${nv.algo ? '' : ' disabled'} title="${esc(nv.algo ? 'Manda as respostas ao Claude para ele entender o novo direcionamento' : dica)}">${ICON.claude}Enviar respostas${partes.length ? ` · ${esc(partes.join(' '))}` : ''}</button><small class="nota">${esc(dica)}</small>`;
  }

  /* ----- item: cabeçalho, contexto herdado, a linha dos passos e os Extras -----
     Um passo aberto por vez (Aprofundar → Montar → Fechar). O passo fica no arquivo ("passo:"), então vale no
     celular também. A linha de estações do topo virou a linha dos passos: o aberto em destaque, os outros dois
     recolhidos com o estado dos cartões; um clique abre qualquer um. No fim do passo, o botão para o próximo (no
     Fechar, "Mandar pro Kanban"). Referências e Comparar saem do caminho: ficam nos Extras, embaixo, em qualquer passo. */
  const ROT = { vazio: 'vazio', obras: 'em obras', pronto: 'pronto' };
  // o que fazer no passo aberto (embaixo do nome, na linha)
  const DICA = {
    aprofundar: 'Responde as perguntas e confere as variáveis',
    montar: 'Pede a estrutura e os riscos, feitos com o que respondeste',
    fechar: 'A versão final e o plano; depois, o Kanban'
  };
  const DEPOIS = { aprofundar: 'Depois: a estrutura e os riscos, com o que está aqui.', montar: 'Depois: a versão final e o plano de ação.' };
  // cada cartão na linha recolhida: "Estrutura pronta", "Riscos vazios" (o fim concorda com o nome)
  const CURTO = {
    perguntas: ['Perguntas', 'as'], variaveis: ['Variáveis', 'as'], estrutura: ['Estrutura', 'a'], riscos: ['Riscos', 'os'],
    versao: ['Versão final', 'a'], plano: ['Plano', 'o'], referencias: ['Referências', 'as'], comparar: ['Comparar', 'o']
  };
  function curto(it, f) {
    const [nome, fim] = CURTO[f], e = I.estadoFerramenta(it, f);
    if (e === 'obras') return `${nome} em obras`;
    return `${nome} ${e === 'vazio' ? 'vazi' : it.desatualizado.includes(f) ? 'desatualizad' : 'pront'}${fim}`;
  }
  // variáveis: o campo mostra o valor que vale (o dele ou, se ele não escreveu, o do Claude)
  const notaVars = temSug => temSug
    ? 'O que está no campo é o que vale, e é isso que a estrutura, os riscos e o plano usam. Escreve por cima para trocar; se apagares o que escreveste, volta a do Claude.'
    : 'Escreve as tuas ou pede ao Claude: o que ele sugerir já vale, e dá para trocar depois.';
  const contaVars = it => `${I.VARIAVEIS.filter(k => it.valem[k].valor).length} de ${I.VARIAVEIS.length}`;

  function renderItem(it, lado) {
    const a = AREA[it.area];
    if (campoAberto && !campoAberto.startsWith(it.file + '|')) campoAberto = null;
    const id = s => it.file + '|' + s;
    const est = f => I.estadoFerramenta(it, f);
    const n = P.total(it.plano);
    const nivel = it.rel ? it.rel.split('/').length : 0;
    const local = ctx.local();
    const F = I.FERRAMENTA;
    const passo = I.PASSO[it.passo], kp = I.PASSOS.indexOf(passo);

    const obrasHTML = f => `<div class="wait fx-wait" role="status"><strong>Claude escrevendo…</strong><p>Leva de 1 a 3 minutos. Aparece aqui sozinho; podes mexer no resto.</p><div class="rail"><div class="runner"></div></div>
      <div class="fx-wb"><button class="btn btn--sm" data-cancela="${f.id}">${ICON.x}Cancelar pedido</button>${local ? `<button class="btn btn--sm btn--ghost" data-simula="${f.id}" title="Só no modo local: escreve uma resposta de exemplo">Simular resposta (modo local)</button>` : ''}</div></div>`;
    const botao = f => {
      if (!f.pede || est(f.id) === 'obras') return '';
      // variáveis: "de novo" só depois de o Claude já ter sugerido (o que ele preencheu não conta)
      const pronto = f.id === 'variaveis' ? Object.keys(it.sugestoes).length > 0 : est(f.id) === 'pronto';
      const rot = pronto ? f.de_novo : f.pede;
      const dica = f.id === 'variaveis' ? `${rot}: o Claude ${pronto ? 'troca só as sugestões dele' : 'sugere as seis'}; o que tu escreveste fica`
        : f.id === 'perguntas' && pronto ? `${rot}: o Claude aprofunda as tuas respostas mais recentes (cada pergunta nova fica pendurada na resposta de onde veio)`
        : `${rot}: pede ao Claude, que usa tudo o que já está preenchido`;
      return `<button class="btn btn--sm${pronto ? '' : ' btn--solid'}" data-pede="${f.id}" title="${esc(dica)}">${ICON.claude}${esc(rot)}</button>`;
    };
    // pronto, mas feito antes das últimas respostas enviadas: aviso discreto, ele decide se refaz
    const velho = f => est(f.id) === 'pronto' && it.desatualizado.includes(f.id);
    const desatHTML = f => `<div class="fx-desat" role="note"><span>Tuas respostas mudaram, refazer?</span><button class="btn btn--sm" data-pede="${f.id}" title="Pede ao Claude de novo, com as respostas novas">${ICON.claude}${esc(f.de_novo)}</button><button class="mini" data-manter="${f.id}" title="Tira o aviso e deixa como está">manter assim</button></div>`;
    const card = (f, corpo, o = {}) => {
      const e = est(f.id), dv = velho(f);
      const cab = `<span class="fx-d" aria-hidden="true"></span><b class="fx-t">${esc(f.nome)}</b><span class="fx-st">${ROT[e]}${dv ? ' · desatualizado' : ''}${o.extra ? ' · ' : ''}<span data-extra="${f.id}">${esc(o.extra || '')}</span></span><span class="sp"></span>${botao(f)}`;
      const body = `<div class="fx-b">${e === 'obras' ? obrasHTML(f) : ''}${dv ? desatHTML(f) : ''}${corpo}</div>`;
      return `<section class="fx fx--${e}${dv ? ' fx--velho' : ''}${o.cls || ''}" id="fx-${f.id}" aria-labelledby="fxt-${f.id}"><header class="fx-h" id="fxt-${f.id}">${cab}</header>${body}</section>`;
    };

    let h = `<div class="et-corpo" style="--c:${a.c}"><div class="et-in et-in--it">`;
    h += `<header class="et-h">${metaIdeia(it, [nivel ? `direção · nível ${nivel}` : 'a ideia inteira', `decidida ${it.criado ? fmtData(it.criado) : ''}`.trim()])}<h1 class="ph">${esc(it.titulo)}</h1>
      <div class="actions">
        <button class="btn btn--sm" data-act="ver-mapa" title="Abre a ideia no mapa, nesta direção">${ICON.back}Ver no mapa</button>
        <button class="btn btn--sm btn--ghost btn--perigo" data-act="tirar" title="Tira só este item da Edição; a direção continua no mapa (dá para desfazer)">${ICON.trash}Tirar da Edição</button>
      </div></header>`;

    // contexto herdado: o caminho sempre à vista; o texto de cada nível abre e fecha
    const cx = it.contexto;
    h += `<details class="fx fx-ctx fx--pronto" id="fx-contexto" data-ctx${ctxAberto ? ' open' : ''}><summary class="fx-h"><span class="fx-d" aria-hidden="true"></span><b class="fx-t">Contexto herdado</b><span class="fx-st">${cx.length ? `congelado ${it.criado ? 'em ' + fmtData(it.criado) : ''}` : 'vazio'}</span><span class="sp"></span><span class="mini fx-dobra" aria-hidden="true"></span>
      <ol class="ctx-linha" aria-label="Caminho até esta direção">${cx.map((c, k) => `<li class="${k === cx.length - 1 ? 'is-ponta' : ''}"><span class="d" aria-hidden="true"></span><span class="r">${esc(c.rotulo || '')}</span><span class="t">${esc(c.titulo)}</span></li>`).join('')}</ol></summary>
      <div class="fx-b ctx-b">${cx.map((c, k) => {
        const ponta = k === cx.length - 1, aberto = nivAberto.has(k) || (ponta && !nivAberto.has(-1 - k));
        const fala = c.fala ? `<span class="lab">Fala</span><div class="md ctx-fala">${md(c.fala, it.ideia.base, ctx.backend())}</div>` : '';
        const notas = c.anotacoes ? `<span class="lab">Anotações dele</span><div class="md">${md(c.anotacoes, it.ideia.base, ctx.backend())}</div>` : '';
        const lap = c.lapidado ? `<div class="ctx-lap"><span class="lab">Lapidado</span><div class="md">${md(c.lapidado, it.ideia.base, ctx.backend())}</div></div>` : '<p class="empty">Sem texto neste nível.</p>';
        return `<details class="ctx-n${ponta ? ' is-ponta' : ''}" data-niv="${k}"${aberto ? ' open' : ''}><summary><span class="r">${esc(c.rotulo || '')}</span><b>${esc(c.titulo)}</b><span class="mini fx-dobra" aria-hidden="true"></span></summary><div class="ctx-c">${fala}${notas}${lap}</div></details>`;
      }).join('') || '<p class="empty">Este item não tem contexto guardado.</p>'}</div></details>`;

    // a linha dos passos: o aberto mostra o que fazer; os recolhidos, o estado de cada cartão
    h += `<nav class="rota" aria-label="Passos do item"><ol>${I.PASSOS.map((p, k) => {
      const on = p === passo, e = I.estadoPasso(it, p.id);
      const sub = on ? DICA[p.id] : p.cartoes.map(f => curto(it, f)).join(' · ');
      return `<li class="rota-p rota-p--${e}${on ? ' is-aberto' : ''}"><button class="rota-b" data-passo="${p.id}"${on ? ' aria-current="step"' : ''} title="${esc(on ? `${p.nome}: o passo aberto` : `Abrir ${p.nome}`)}"><span class="d" aria-hidden="true"></span><span class="n"><span class="k">${k + 1}</span>${esc(p.nome)}</span><span class="s">${esc(sub)}</span></button></li>`;
    }).join('')}</ol></nav>`;

    // os cartões (só os do passo aberto e, nos Extras, Referências e Comparar)
    const estruturaVer = txt => {
      const b = I.blocos(txt);
      if (!b.blocos.length) return `<div class="md">${md(txt, it.base, ctx.backend())}</div>`;
      return `${b.intro ? `<div class="md">${md(b.intro, it.base, ctx.backend())}</div>` : ''}<ol class="est-l">${b.blocos.map(x => `<li><b>${esc(x.titulo)}</b>${x.texto ? `<div class="md">${md(x.texto, it.base, ctx.backend())}</div>` : ''}</li>`).join('')}</ol>`;
    };
    const compararVer = txt => {
      const b = I.blocos(txt);
      if (!b.blocos.length) return `<div class="md">${md(txt, it.base, ctx.backend())}</div>`;
      return `${b.intro ? `<div class="md">${md(b.intro, it.base, ctx.backend())}</div>` : ''}<div class="cmp">${b.blocos.map(x => `<article class="cmp-c${/^em resumo/i.test(x.titulo) ? ' is-resumo' : ''}"><b>${esc(x.titulo)}</b><div class="md">${md(x.texto, it.base, ctx.backend())}</div></article>`).join('')}</div>`;
    };
    const irmas = it.no && it.no.mae ? it.no.mae.direcoes.filter(d => d !== it.no) : it.no === it.ideia ? it.ideia.direcoes : [];
    // perguntas em galho: a filha fica embaixo da mãe, recuada, ligada pela linha (o trilho de metrô da área).
    // Trilhos: o da mãe desce do círculo dela; cada filha tem o cotovelo até o seu; quem tem irmã mais abaixo deixa
    // o trilho seguir por ela (e pelas netas dela)
    const ps = it.perguntas;
    const temDepois = (a, k) => I.filhasDe(ps, a).some(j => j > k);
    const trilhos = k => {
      const p = ps[k]; let out = '';
      for (let a = p.mae; a >= 0; a = ps[a].mae) {
        const L = ps[a].nivel, segue = temDepois(a, k);
        if (L === p.nivel - 1) out += `<i class="tr ${segue ? 'tr--segue' : 'tr--fim'}" style="--l:${L}"></i><i class="tr-h" style="--l:${L}"></i>`;
        else if (segue) out += `<i class="tr tr--segue" style="--l:${L}"></i>`;
      }
      if (I.filhasDe(ps, k).length) out += `<i class="tr tr--desce" style="--l:${p.nivel}"></i>`;
      return out;
    };
    const outroAprofundando = it.pedidos.includes('aprofundar');
    const perguntaHTML = (p, k) => {
      const filha = p.nivel > 1, emObras = I.aprofundando(it, k);
      // o botão aparece quando ele responde (a página não redesenha enquanto ele digita)
      const podeGalho = p.nivel < I.PROFUNDIDADE && I.filhasDe(ps, k).every(j => ps[j].r.trim());
      const pe = emObras
        ? `<div class="pg-pe pg-pe--obras" role="status"><span class="pg-ap-st">Claude aprofundando esta resposta…</span><button class="mini" data-aprofunda-cancela>cancelar</button>${local ? `<button class="mini" data-aprofunda-simula title="Só no modo local: escreve uma pergunta de exemplo">simular (modo local)</button>` : ''}</div>`
        : podeGalho && !outroAprofundando ? `<div class="pg-pe"${p.r.trim() ? '' : ' hidden'} data-pe="${k}"><button class="mini pg-ap" data-aprofunda="${k}" title="O Claude faz 1 ou 2 perguntas que partem desta resposta">${I.SETA} aprofundar esta</button></div>` : '';
      return `<li class="pg-n${p.nivel}${filha ? ' pg--filha' : ''}${p.r.trim() ? ' is-resp' : ''}" style="--n:${p.nivel}">${trilhos(k)}<label class="pg-q" for="pg-${k}">${filha ? `<span class="pg-seta" aria-label="nasceu da resposta de cima">${I.SETA}</span> ` : ''}${esc(p.q)}</label><button class="pg-x" data-exclui="${k}" aria-label="Excluir a pergunta: ${esc(p.q)}" title="${I.filhasDe(ps, k).length ? 'Não está alinhada: excluir com as que nasceram dela (dá para desfazer)' : 'Não está alinhada: excluir (dá para desfazer)'}">${ICON.x}</button><textarea class="notas pg-r" id="pg-${k}" data-resp="${k}" rows="2" placeholder="Tua resposta…">${esc(p.r)}</textarea>${pe}</li>`;
    };
    const cartao = {
      perguntas() {
        const respondidas = it.perguntas.filter(p => p.r.trim()).length;
        // o rumo dele (bússola de todas as ferramentas) fica no topo, sempre à vista
        const rumo = `<div class="pg-rumo"><label class="pg-rumo-l" for="pg-rumo">Para onde eu quero levar isto <span>nas minhas palavras</span></label>
          <textarea class="notas pg-rumo-t" id="pg-rumo" data-rumo rows="2" placeholder="Escreve do teu jeito o que tu queres que isto vire, mesmo que nenhuma pergunta leve lá.">${esc(it.rumo)}</textarea>
          <small class="nota">É a bússola: Mais perguntas, Estrutura, Riscos, Versão final e Plano seguem isto. O Claude nunca reescreve.</small></div>`;
        // o que o Claude entendeu do último envio (3 a 5 linhas), no topo do cartão
        const entendi = it.entendido.trim() ? `<div class="pg-ent"><span class="lab">O que entendi <span>Claude · do último envio</span></span><div class="md">${md(it.entendido, it.base, ctx.backend())}</div></div>` : '';
        const lendo = it.pedidos.includes('respostas');
        const envio = lendo
          ? `<div class="wait fx-wait pg-lendo" role="status"><strong>Claude lendo tuas respostas…</strong><p>Leva de 1 a 3 minutos. Ele escreve o que entendeu aqui em cima e ajusta as sugestões; podes mexer no resto.</p><div class="rail"><div class="runner"></div></div>
            <div class="fx-wb"><button class="btn btn--sm" data-envio-cancela>${ICON.x}Cancelar envio</button>${local ? `<button class="btn btn--sm btn--ghost" data-envio-simula title="Só no modo local: escreve uma resposta de exemplo">Simular resposta (modo local)</button>` : ''}</div></div>`
          : (it.perguntas.length || it.rumo.trim() || it.entendido.trim()) ? `<div class="pg-envia" data-envia-bar>${envioHTML(I.novidades(it))}</div>` : '';
        const corpo = entendi + rumo + (it.perguntas.length
          ? `<ol class="pergs">${it.perguntas.map((p, k) => perguntaHTML(p, k)).join('')}</ol>`
          : (est('perguntas') === 'obras' ? '' : `<p class="empty">O Claude faz até 5 perguntas, só as que mudam a ideia (público, formato, o que a torna boa, como fecha). Tu respondes aqui mesmo; as respostas entram em tudo o que ele escrever depois.</p>`))
          + `<details class="pg-nova" data-pgnova${novaAberta ? ' open' : ''}><summary><span class="mini">+ Acrescentar uma pergunta minha</span></summary>
            <div class="pg-nova-b"><label class="lab" for="pg-nova-q">Pergunta</label><input id="pg-nova-q" data-nova-q autocomplete="off" placeholder="A pergunta que faltou">
            <label class="lab" for="pg-nova-r">Resposta</label><textarea class="notas pg-r" id="pg-nova-r" data-nova-r rows="2" placeholder="A tua resposta"></textarea>
            <div class="fx-wb"><button class="btn btn--sm btn--solid" data-nova-ok>Acrescentar</button><small class="nota">Entra na lista como as outras.</small></div></div></details>`
          + envio
          + (it.descartadas.length ? `<details class="pg-desc" data-pgdesc${descAberto ? ' open' : ''}><summary><span class="lab">Descartadas · ${it.descartadas.length}</span><span class="mini fx-dobra" aria-hidden="true"></span></summary>
            <ul>${it.descartadas.map((q, k) => `<li><span>${esc(q)}</span><button class="mini" data-traz="${k}">trazer de volta</button></li>`).join('')}</ul>
            <small class="nota">O Claude não volta a elas nem faz parecidas.</small></details>` : '');
        return card(F.perguntas, corpo, { extra: it.perguntas.length ? `${respondidas} de ${it.perguntas.length} respondidas` : '' });
      },
      variaveis() {
        // um campo só por variável, com o valor que vale; o do Claude leva a marca "do Claude" até ele escrever por cima
        const temSug = I.VARIAVEIS.some(k => String(it.sugestoes[k] || '').trim());
        const corpo = `<div class="vars">${I.VARIAVEIS.map(k => {
          const x = it.valem[k], sg = String(it.sugestoes[k] || '').trim();
          return `<div class="var${x.de === 'claude' ? ' is-claude' : ''}"><label for="var-${k}">${k}<span class="var-de">do Claude</span></label><textarea class="var-in" id="var-${k}" data-var="${k}" rows="1" autocomplete="off" placeholder="${esc(sg || '—')}">${esc(x.valor)}</textarea></div>`;
        }).join('')}</div>${it.varExtras.length ? `<div class="md md-sm var-x">${md(it.varExtras.join('\n'), it.base, ctx.backend())}</div>` : ''}<small class="nota" data-varnota>${esc(notaVars(temSug))}</small>`;
        return card(F.variaveis, corpo, { extra: contaVars(it) });
      },
      estrutura: () => card(F.estrutura, campoHTML(id('est'), it.estrutura, it.base, 'O Claude quebra a ideia em blocos (o roteiro). Ou escreve à mão.', 'Cada bloco começa com ### (ex.: ### 1. Gancho).', estruturaVer)),
      riscos: () => card(F.riscos, campoHTML(id('ris'), it.riscos, it.base, 'O que pode dar errado e como evitar. O Claude lista; tu ajustas.', 'Uma linha por risco.')),
      versao: () => card(F.versao, campoHTML(id('ver'), it.versao, it.base, 'Texto curto e fechado: o que vai ser feito. O Claude escreve com tudo acima.', 'Títulos aqui começam com ###.')),
      plano() {
        let plano = '';
        if (n) {
          let k0 = 0;
          for (const c of P.COLUNAS) {
            const ts = it.plano[c.id].tarefas; if (!ts.length) continue;
            plano += `<span class="lab">${esc(c.nome)} · ${ts.length}</span><ol class="plano-l" start="${k0 + 1}">${ts.map(t => `<li>${linkar(t.texto)}</li>`).join('')}</ol>`;
            k0 += ts.length;
          }
          plano += `<div class="fx-wb"><button class="mini" data-abre="${esc(id('pl'))}">editar a lista</button></div>`;
          if (campoAberto === id('pl')) plano = `<span class="lab">A fazer</span>` + campoHTML(id('pl'), P.escreverTarefas(it.plano.afazer), it.base, '', 'Uma tarefa por linha: "- verbo e o que fazer".');
        } else if (est('plano') !== 'obras') plano = `<p class="empty">Quando a Edição estiver boa, “Gerar plano”: de 5 a 12 tarefas concretas, a primeira dá para fazer hoje. Depois “Mandar pro Kanban”, aqui embaixo.</p>`;
        return card(F.plano, plano, { cls: ' plano', extra: n ? plural(n, 'tarefa', 'tarefas') : '' });
      },
      referencias: () => card(F.referencias, `<div class="ref-add"><input data-ref placeholder="Cola um link (ou link de imagem) e Enter" aria-label="Novo link de referência" autocomplete="off"></div>`
        + campoHTML(id('ref'), it.referencias, it.base, 'Links, nomes, notas. Imagem: cola o link dela.', 'Imagem: ![](link da imagem).')),
      comparar: () => card(F.comparar, (irmas.length && !it.comparar.trim() ? `<p class="empty">Irmãs: ${irmas.map(d => esc(d.titulo)).join(' · ')}</p>` : '')
        + campoHTML(id('cmp'), it.comparar, it.base, 'O Claude põe as direções irmãs lado a lado e diz o que vale puxar delas.', 'Cada irmã começa com ###.', compararVer))
    };

    // o passo aberto e, no fim dele, o botão para o próximo (e o de voltar)
    const prox = I.PASSOS[kp + 1], ant = I.PASSOS[kp - 1];
    const voltar = ant ? `<button class="btn btn--sm btn--ghost" data-passo="${ant.id}">${ICON.ant}Voltar para ${esc(ant.nome)}</button>` : '';
    const seguir = prox
      ? `<small class="nota">${esc(DEPOIS[passo.id])}</small><button class="btn btn--solid" data-passo="${prox.id}">Seguir para ${esc(prox.nome)}${ICON.prox}</button>`
      : `<small class="nota">${n ? 'As tarefas entram em A fazer, no Kanban.' : est('plano') === 'obras' ? 'O Claude está escrevendo o plano; o botão liga quando ele chegar.' : 'Primeiro “Gerar plano”, aqui em cima.'}</small><button class="btn btn--solid" data-act="kanban"${n ? '' : ' disabled'} title="${n ? 'As tarefas entram em A fazer' : 'Primeiro “Gerar plano”'}">${ICON.kanban}Mandar pro Kanban${ICON.prox}</button>`;
    h += `<section class="passo" id="passo-corpo" aria-label="${esc(`${kp + 1}. ${passo.nome}`)}"><div class="fx-grid">${passo.cartoes.map(f => cartao[f]()).join('')}</div>
      <div class="passo-fim">${voltar}<span class="sp"></span>${seguir}</div></section>`;

    // Extras: fora do caminho, recolhidos, em qualquer passo
    const exAberto = extrasAberto || est('comparar') === 'obras';
    h += `<details class="extras" data-extras${exAberto ? ' open' : ''}><summary><span class="ex-t">Extras</span><span class="ex-s">${esc(I.EXTRAS.map(f => curto(it, f)).join(' · '))}</span><span class="sp"></span><span class="mini fx-dobra" aria-hidden="true"></span></summary>
      <div class="fx-grid">${I.EXTRAS.map(f => cartao[f]()).join('')}</div></details>`;
    h += `</div></div>`;

    const scroll = el.querySelector('.et-corpo') ? el.querySelector('.et-corpo').scrollTop : 0;
    el.innerHTML = lado + h;
    hidratar(el, ctx.backend());
    const corpo = el.querySelector('.et-corpo'); if (corpo) corpo.scrollTop = scroll;
    ligarLadoEd();
    ligarCampos({
      [id('est')]: { file: it.file, sec: 'Estrutura', min: 3, msg: `App: edita a estrutura de "${it.titulo}"` },
      [id('ris')]: { file: it.file, sec: 'Riscos', min: 3, msg: `App: edita os riscos de "${it.titulo}"` },
      [id('ref')]: { file: it.file, sec: 'Referências', min: 3, msg: `App: referências de "${it.titulo}"` },
      [id('cmp')]: { file: it.file, sec: 'Comparar', min: 3, msg: `App: edita a comparação de "${it.titulo}"` },
      [id('ver')]: { file: it.file, sec: 'Versão final', min: 3, msg: `App: edita a versão final de "${it.titulo}"` },
      [id('pl')]: { file: it.file, sec: 'Plano/A fazer', min: 4, msg: `App: edita o plano de "${it.titulo}"` }
    }, renderEdicao);
    ligarItem(it);
  }

  function ligarItem(it) {
    const titulo = it.titulo;
    const gravar = (patch, msg) => st().remendar(it.file, patch, msg);
    const atual = () => porKey(it.key) || it;    // o item mais novo (as respostas mudam sem redesenhar)
    el.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
      const act = b.dataset.act;
      if (act === 'ver-mapa') ctx.verNoMapa(it);
      if (act === 'tirar') ctx.apagarItem(it);
      if (act === 'kanban' && P.total(it.plano)) ctx.mudarEstado(it, 'kanban');
    }));
    // passos: abrir um (na linha, ou "Seguir para…" / "Voltar para…" no fim) grava o passo no arquivo e volta à linha
    el.querySelectorAll('[data-passo]').forEach(b => b.addEventListener('click', () => {
      const p = b.dataset.passo; if (!I.PASSO[p] || p === atual().passo) return;
      gravar(I.remendoPasso(p), `App: abre o passo ${I.PASSO[p].nome} em "${titulo}"`);
      campoAberto = null;
      renderEdicao();
      const linha = el.querySelector('.rota');
      if (linha) linha.scrollIntoView({ behavior: RM.matches ? 'auto' : 'smooth', block: 'start' });
      const on = el.querySelector('.rota-p.is-aberto .rota-b'); if (on) on.focus({ preventScroll: true });
    }));
    // pedidos ao Claude (a automação do GitHub responde; o cartão fica "em obras" até lá)
    el.querySelectorAll('[data-pede]').forEach(b => b.addEventListener('click', () => {
      const f = I.FERRAMENTA[b.dataset.pede];
      gravar({ fm: { pedido: I.comPedido(it.pedidos, f.id) } }, `App: pede ao Claude "${f.pede}" em "${titulo}"`);
      if (f.id === 'comparar') extrasAberto = true;
      renderEdicao(); ctx.renderNav();
      toast(ctx.local() ? 'Pedido marcado (modo local: o Claude não roda aqui).' : 'Pedido enviado. Em 1 a 3 minutos aparece aqui.');
    }));
    el.querySelectorAll('[data-cancela]').forEach(b => b.addEventListener('click', () => {
      const f = I.FERRAMENTA[b.dataset.cancela];
      gravar({ fm: { pedido: I.comPedido(it.pedidos, f.id, false) } }, `App: cancela o pedido "${f.pede}" em "${titulo}"`);
      renderEdicao(); toast('Pedido cancelado.');
    }));
    el.querySelectorAll('[data-simula]').forEach(b => b.addEventListener('click', () => {
      const f = I.FERRAMENTA[b.dataset.simula], ex = I.exemplo(f.id); if (!ex) return;
      gravar(Object.assign({ fm: { pedido: I.comPedido(it.pedidos, f.id, false) } }, ex), `App: resposta de exemplo (modo local) para "${f.pede}"`);
      renderEdicao();
    }));
    // respostas: cada pergunta guarda a resposta embaixo dela
    // a barra do "Enviar respostas" acompanha o que ele digita (sem redesenhar a página, o foco fica no campo)
    const barra = el.querySelector('[data-envia-bar]');
    const atualizarEnvio = () => { if (barra) barra.innerHTML = envioHTML(I.novidades(atual())); };
    el.querySelectorAll('[data-resp]').forEach(t => t.addEventListener('input', () => {
      const p = it.perguntas[+t.dataset.resp]; if (!p) return;
      gravar(I.remendoResposta(p.h, t.value), `App: responde perguntas em "${titulo}"`);
      const pe = el.querySelector(`[data-pe="${t.dataset.resp}"]`); if (pe) pe.hidden = !t.value.trim();
      atualizarEnvio();
    }));
    // o rumo dele: grava como ele escreve (a bússola das ferramentas)
    const rumo = el.querySelector('[data-rumo]');
    if (rumo) rumo.addEventListener('input', () => { gravar(I.remendoRumo(rumo.value), `App: para onde quer levar "${titulo}"`); atualizarEnvio(); });
    if (barra) barra.addEventListener('click', e => {
      const b = e.target.closest('[data-envia]'); if (!b || b.disabled) return;
      const j = atual(); if (!I.novidades(j).algo) return;
      gravar(I.remendoEnviar(j), `App: pede ao Claude para ler as respostas de "${titulo}"`);
      renderEdicao(); ctx.renderNav();
      toast(ctx.local() ? 'Respostas marcadas (modo local: o Claude não roda aqui).' : 'Respostas enviadas. Em 1 a 3 minutos o Claude diz o que entendeu.');
    });
    const ec = el.querySelector('[data-envio-cancela]');
    if (ec) ec.addEventListener('click', () => { gravar(I.remendoCancelarEnvio(atual()), `App: cancela o envio das respostas em "${titulo}"`); renderEdicao(); toast('Envio cancelado.'); });
    const es = el.querySelector('[data-envio-simula]');
    if (es) es.addEventListener('click', () => { gravar(I.exemploRespostas(atual()), 'App: resposta de exemplo (modo local) para "Enviar respostas"'); renderEdicao(); });
    el.querySelectorAll('[data-manter]').forEach(b => b.addEventListener('click', () => {
      gravar(I.remendoManter(atual(), b.dataset.manter), `App: mantém ${I.FERRAMENTA[b.dataset.manter].nome.toLowerCase()} de "${titulo}" como está`);
      renderEdicao();
    }));
    // excluir pergunta: some na hora, vira "descartada" e dá para desfazer por 8 s
    const curta = q => q.length > 48 ? q.slice(0, 47) + '…' : q;
    el.querySelectorAll('[data-exclui]').forEach(b => b.addEventListener('click', () => {
      const q0 = it.perguntas[+b.dataset.exclui]; if (!q0) return;
      const j = atual(), k = j.perguntas.findIndex(x => x.h === q0.h), p = j.perguntas[k]; if (!p) return;
      // as filhas (e netas) saem junto: nasceram da resposta dela
      const galho = I.galhoDe(j.perguntas, k).map(x => j.perguntas[x]), nf = galho.length - 1;
      gravar(I.remendoExcluir(j, p.q), `App: descarta a pergunta "${curta(p.q)}"${nf ? ` e ${nf} de seguimento` : ''} em "${titulo}"`);
      renderEdicao();
      toast(`Pergunta excluída${nf ? ` com ${nf === 1 ? 'a que nasceu dela' : `as ${nf} que nasceram dela`}` : ''}: “${curta(p.q)}”`, { acao: 'Desfazer', ms: 8000, fn: () => {
        const txt = st().texto(it.file); if (txt == null) return;
        gravar(I.remendoVolta(txt, galho, k), `App: desfaz descartar a pergunta "${curta(p.q)}" em "${titulo}"`);
        renderEdicao();
      } });
    }));
    el.querySelectorAll('[data-traz]').forEach(b => b.addEventListener('click', () => {
      const q = it.descartadas[+b.dataset.traz]; if (q == null) return;
      gravar(I.remendoTrazer(atual(), q), `App: traz de volta a pergunta "${curta(q)}" em "${titulo}"`);
      renderEdicao();
    }));
    // "↳ aprofundar esta": o Claude faz 1 ou 2 perguntas que partem desta resposta (uma de cada vez)
    el.querySelectorAll('[data-aprofunda]').forEach(b => b.addEventListener('click', () => {
      const q0 = it.perguntas[+b.dataset.aprofunda]; if (!q0) return;
      const j = atual(), k = j.perguntas.findIndex(x => x.h === q0.h); if (k < 0 || j.pedidos.includes('aprofundar')) return;
      // a resposta acabou de ser escrita: o remendo dela vai antes, no mesmo envio
      const r = I.remendoAprofundar(j, k); if (!r) return;
      gravar(r, `App: pede ao Claude para aprofundar "${curta(q0.q)}" em "${titulo}"`);
      renderEdicao(); ctx.renderNav();
      toast(ctx.local() ? 'Pedido marcado (modo local: o Claude não roda aqui).' : 'Pedido enviado. Em 1 a 3 minutos a pergunta nova aparece embaixo desta.');
    }));
    const ac = el.querySelector('[data-aprofunda-cancela]');
    if (ac) ac.addEventListener('click', () => { gravar(I.remendoCancelarAprofundar(atual()), `App: cancela o aprofundar em "${titulo}"`); renderEdicao(); toast('Pedido cancelado.'); });
    const as = el.querySelector('[data-aprofunda-simula]');
    if (as) as.addEventListener('click', () => {
      const txt = st().texto(it.file); if (txt == null) return;
      gravar(I.exemploAprofundar(txt, atual()), 'App: resposta de exemplo (modo local) para "aprofundar"');
      renderEdicao();
    });
    // pergunta dele, já com a resposta
    const nq = el.querySelector('[data-nova-q]'), nr = el.querySelector('[data-nova-r]');
    const novaOk = () => {
      if (!nq.value.trim()) { nq.focus(); return; }
      const r = I.remendoNova(atual(), nq.value, nr.value);
      if (!r) { toast('Essa pergunta já está na lista.'); nq.focus(); return; }
      gravar(r, `App: pergunta dele em "${titulo}"`);
      novaAberta = false; renderEdicao(); toast('Pergunta acrescentada.');
    };
    if (nq) {
      nq.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); nr.focus(); } });
      nr.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); novaOk(); } });
      el.querySelector('[data-nova-ok]').addEventListener('click', novaOk);
    }
    const pn = el.querySelector('[data-pgnova]');
    if (pn) {
      pn.addEventListener('toggle', () => { novaAberta = pn.open; });
      pn.querySelector('summary').addEventListener('click', () => setTimeout(() => { if (pn.open) nq.focus(); }));
    }
    const pd = el.querySelector('[data-pgdesc]'); if (pd) pd.addEventListener('toggle', () => { descAberto = pd.open; });
    // variáveis: um campo só, com o valor que vale. Em "Decididas" vai só o que ele escreve (o campo que ele mexeu;
    // os outros ficam como estão no arquivo, e o do Claude nunca entra lá). Campo vazio volta a valer a sugestão do
    // Claude: enquanto ele está no campo, ela aparece apagada; ao sair, volta a ser o valor, com a marca "do Claude".
    const umaLinha = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    const marcarVar = x => {
      // a marca fica enquanto o que vale é a do Claude: ele não escreveu nada dele neste campo
      const j = atual(), k = x.dataset.var, sg = String(j.sugestoes[k] || '').trim();
      x.closest('.var').classList.toggle('is-claude', !String(j.variaveis[k] || '').trim() && !!sg);
      const c = el.querySelector('[data-extra="variaveis"]'); if (c) c.textContent = contaVars(j);
    };
    // o campo cresce com o texto (valor longo aparece inteiro); Enter vai para o próximo, sem quebrar a linha
    const cresce = t => { if (!CSS.supports('field-sizing', 'content')) { t.style.height = 'auto'; t.style.height = t.scrollHeight + 4 + 'px'; } };
    const campos = [...el.querySelectorAll('[data-var]')];
    campos.forEach((x, i) => {
      cresce(x);
      x.addEventListener('input', () => {
        const k = x.dataset.var, j = atual();
        if (umaLinha(x.value) !== umaLinha(j.variaveis[k])) gravar(I.remendoVariaveis(Object.assign({}, j.variaveis, { [k]: x.value }), j.varExtras), `App: variáveis de "${titulo}"`);
        marcarVar(x); cresce(x);
      });
      x.addEventListener('keydown', e => {
        if (e.key !== 'Enter' || e.isComposing) return;
        e.preventDefault();
        if (campos[i + 1]) campos[i + 1].focus(); else x.blur();
      });
      x.addEventListener('blur', () => {
        const v = atual().valem[x.dataset.var];
        if (!x.value.trim() && v.de === 'claude') x.value = v.valor;
        marcarVar(x); cresce(x);
      });
    });
    // referência rápida: link vira item da lista; link de imagem vira imagem
    const ref = el.querySelector('[data-ref]');
    if (ref) ref.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const v = ref.value.trim(); if (!v) return;
      const linha = /^https?:\/\/\S+\.(png|jpe?g|gif|webp)(\?\S*)?$/i.test(v) ? `![](${v})` : `- ${v}`;
      gravar({ sec: { 'Referências': (it.referencias.trim() ? it.referencias.trim() + '\n' : '') + linha } }, `App: referência nova em "${titulo}"`);
      renderEdicao();
      const n = el.querySelector('[data-ref]'); if (n) n.focus();
    });
    // o que está aberto continua aberto ao redesenhar
    const cx = el.querySelector('[data-ctx]'); if (cx) cx.addEventListener('toggle', () => { ctxAberto = cx.open; });
    const ex = el.querySelector('[data-extras]'); if (ex) ex.addEventListener('toggle', () => { extrasAberto = ex.open; });
    el.querySelectorAll('[data-niv]').forEach(d => d.addEventListener('toggle', () => {
      const k = +d.dataset.niv; nivAberto.delete(k); nivAberto.delete(-1 - k);
      nivAberto.add(d.open ? k : -1 - k);
    }));
  }

  /* ----- jeito antigo: a ideia inteira ----- */
  function renderAntiga(i, lado) {
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
    h += `<div class="aviso aviso--antiga" role="note"><span class="lab">Jeito antigo · a ideia inteira</span>
      <p>Agora tu decides <b>uma direção de cada vez</b>: no mapa, cada direção tem “Decidir → Edição”, e ela chega aqui com o caminho até ela e as ferramentas novas.</p>
      <div class="cmd"><button class="btn btn--sm btn--solid" data-act="voltar-bs">${ICON.back}Voltar ao mapa e decidir uma ponta</button><button class="btn btn--sm" data-act="converter">Usar as ferramentas com a ideia inteira</button></div>
      <small>Nada se perde: escolhas, versão final e plano vão junto para o item novo.</small></div>`;
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
    ligarLadoEd();
    hidratar(el, ctx.backend());
    const corpo = el.querySelector('.et-corpo'); if (corpo) corpo.scrollTop = scroll;
    ligarCampos({
      [id('esc')]: { file: i.file, sec: 'Edição/Escolhas', msg: `App: escolhas de "${i.titulo}"` },
      [id('ver')]: { file: i.file, sec: 'Edição/Versão final', msg: `App: edita a versão final de "${i.titulo}"` },
      [id('notas')]: { file: i.file, sec: 'Bruto/Anotações', msg: `App: anotações em "${i.titulo}"` }
    }, renderEdicao);
    el.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', async () => {
      const act = b.dataset.act;
      if (act === 'voltar-bs') ctx.mudarEstado(i, 'ativa');
      if (act === 'converter') ctx.converterAntiga(i);
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
    const ativas = itensEm('kanban').concat(lista('kanban')), feitas = itensEm('feita').concat(lista('feita'));
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
          : `<button class="btn btn--sm${n && feitos === n ? ' btn--solid' : ''}" data-act="concluir"${n && feitos === n ? '' : ' disabled'} title="${n && feitos === n ? 'Tudo feito: marca como concluída' : 'Libera quando tudo estiver em Feito'}">${ICON.check}${i.kind === 'item' ? 'Concluir' : 'Concluir ideia'}</button>`}
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
  const ideiaKb = () => porKey(UI.kb);
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
      const j = porKey(i.key); if (!j) return;
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
    const i = porKey(d.i.key) || d.i;
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
    contar: e => lista(e).length + itensEm(e).length,
    soltar: () => { kb.editando = kb.criando = null; campoAberto = null; },
    ideiaAberta: () => { if (UI.etapa !== 'edicao') return ideiaKb(); const x = porKey(UI.ed); return x && x.estado === 'edicao' ? x : null; }
  };
}
