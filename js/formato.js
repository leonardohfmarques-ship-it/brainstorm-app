// Leitura e escrita do formato das ideias (docs/FORMATO.md do repositório brainstorm).
// Regra de ouro: mexer só no que foi pedido. Tudo o que o app não entende volta igual, byte a byte.
// Frontmatter: "chave: resto da linha" (sem YAML estrito; títulos com dois-pontos vêm sem aspas)
// e listas curtas "[120, -40]". Ao gravar, mantém o mesmo estilo, sem aspas.

const FENCE = /^\s{0,3}(```|~~~)/;
const HEAD = /^(#{1,6})[ \t]+(.*?)[ \t]*#*[ \t]*$/;
const KEY = /^([A-Za-z_][\w-]*):(?:[ \t]+(.*)|[ \t]*)$/;

/* ---------------- documento ---------------- */
export function abrir(text) {
  let t = String(text == null ? '' : text);
  const bom = t.charCodeAt(0) === 0xFEFF;
  if (bom) t = t.slice(1);
  const crlf = t.includes('\r\n');
  if (crlf) t = t.replace(/\r\n/g, '\n');
  const lines = t.split('\n');
  let fm = null, bodyStart = 0;
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    if (end > 0) { fm = lines.slice(1, end); bodyStart = end + 1; }
  }
  return { bom, crlf, fm, body: lines.slice(bodyStart) };
}

export function fechar(doc) {
  const out = (doc.fm ? ['---', ...doc.fm, '---'] : []).concat(doc.body).join('\n');
  return (doc.bom ? '﻿' : '') + (doc.crlf ? out.replace(/\n/g, '\r\n') : out);
}

/* ---------------- frontmatter ---------------- */
function semAspas(v) {
  if (v.length >= 2 && v[0] === '"' && v[v.length - 1] === '"') { try { return JSON.parse(v); } catch (e) { return v.slice(1, -1); } }
  if (v.length >= 2 && v[0] === "'" && v[v.length - 1] === "'") return v.slice(1, -1).replace(/''/g, "'");
  return v;
}
function item(v) {
  v = semAspas(v.trim());
  return /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v;
}
// comentário só quando há dois ou mais espaços antes do # (um título pode ter "Reel #3")
function tirarComentario(v) { const m = v.match(/^(.*?)[ \t]{2,}#.*$/); return m ? m[1] : v; }

export function lerCampos(doc) {
  const o = {};
  if (!doc.fm) return o;
  const L = doc.fm;
  for (let i = 0; i < L.length; i++) {
    const m = L[i].match(KEY); if (!m) continue;
    let v = tirarComentario(m[2] == null ? '' : m[2]).trim();
    if (v === '') {
      const lst = [];
      while (i + 1 < L.length && /^\s+-\s/.test(L[i + 1])) { lst.push(item(L[i + 1].replace(/^\s+-\s/, ''))); i++; }
      o[m[1]] = lst.length ? lst : '';
      continue;
    }
    if (v[0] === '[' && v[v.length - 1] === ']') {
      const inner = v.slice(1, -1).trim();
      o[m[1]] = inner ? inner.split(',').map(item) : [];
    } else o[m[1]] = semAspas(v);
  }
  return o;
}

export function valorYaml(v) {
  if (Array.isArray(v)) return '[' + v.map(x => typeof x === 'number' ? String(Math.round(x * 100) / 100) : String(x)).join(', ') + ']';
  return String(v).replace(/[\r\n]+/g, ' ').trim();
}

export function gravarCampo(doc, key, value) {
  if (!doc.fm) { if (value == null) return doc; doc.fm = []; }
  const L = doc.fm;
  let at = -1;
  for (let i = 0; i < L.length; i++) { const m = L[i].match(KEY); if (m && m[1] === key) { at = i; break; } }
  // linhas de lista em bloco que pertencem a esta chave
  let span = 1;
  if (at >= 0) while (at + span < L.length && /^\s+-\s/.test(L[at + span])) span++;
  if (value == null) { if (at >= 0) L.splice(at, span); return doc; }
  const novo = valorYaml(value);
  if (at >= 0) {
    const raw = L[at].slice(key.length + 1);
    const com = raw.match(/^(.*?)([ \t]{2,}#.*)$/);
    L.splice(at, span, `${key}: ${novo}${com ? com[2] : ''}`);
  } else {
    L.push(`${key}: ${novo}`);
  }
  return doc;
}

/* ---------------- seções ---------------- */
export function titulos(body) {
  const out = []; let fence = false;
  body.forEach((ln, i) => {
    if (FENCE.test(ln)) { fence = !fence; return; }
    if (fence) return;
    const m = ln.match(HEAD); if (m) out.push({ i, level: m[1].length, name: m[2].trim() });
  });
  return out;
}
// ordem das seções de cima (## ...): ideia.md (Bruto → Lapidado → Edição → Plano) e item.md da Edição
// (Contexto → Perguntas → ... → Versão final → Plano). Uma lista só serve aos dois, porque não se misturam.
const ORDEM = ['bruto', 'lapidado', 'edicao', 'contexto', 'perguntas', 'variaveis', 'estrutura', 'riscos', 'referencias', 'comparar', 'versao final', 'plano'];
const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// path = ['Bruto', 'Anotações'] → { h, level, start, end } (linhas do corpo, end exclusivo)
export function acharSecao(doc, path) {
  const hs = titulos(doc.body);
  let lo = 0, hi = doc.body.length, lvl = 0, found = null;
  for (const name of path) {
    // a seção de cima é sempre "##" e cada passo é filha direta: um "##### Plano" copiado dentro de outra seção
    // (no Contexto de um item, por exemplo) nunca é confundido com a seção "## Plano"
    const nivel = lvl ? lvl + 1 : 2;
    const h = hs.find(x => x.i >= lo && x.i < hi && x.level === nivel && norm(x.name) === norm(name));
    if (!h) return null;
    const next = hs.find(x => x.i > h.i && x.level <= h.level);
    const end = next && next.i < hi ? next.i : hi;
    found = { h: h.i, level: h.level, start: h.i + 1, end };
    lo = h.i + 1; hi = end; lvl = h.level;
  }
  return found;
}

function aparar(lines) {
  let a = 0, b = lines.length;
  while (a < b && !lines[a].trim()) a++;
  while (b > a && !lines[b - 1].trim()) b--;
  return lines.slice(a, b);
}

export function lerSecao(doc, path) {
  const s = acharSecao(doc, path);
  return s ? aparar(doc.body.slice(s.start, s.end)).join('\n') : null;
}

// filhas com lugar fixo dentro da mãe: em Perguntas, "Para onde eu quero" vem antes de tudo, "O que entendi" logo
// depois dele e "Descartadas" no fim
const FILHAS = { perguntas: { primeiro: ['para onde eu quero', 'o que entendi'], ultimo: ['descartadas'] } };

// content null = apagar a seção inteira (título e texto); se ela não existe, nada muda
export function gravarSecao(doc, path, content) {
  if (content === null) {
    const s = acharSecao(doc, path); if (!s) return doc;
    const eof = s.end >= doc.body.length, final = doc.body[doc.body.length - 1] === '';
    doc.body.splice(s.h, s.end - s.h);
    if (eof && final && doc.body[doc.body.length - 1] !== '') doc.body.push('');
    return doc;
  }
  const novo = aparar(String(content == null ? '' : content).replace(/\r\n/g, '\n').split('\n'));
  const s = acharSecao(doc, path);
  if (s) {
    const temDepois = s.end < doc.body.length;
    const fim = temDepois ? [''] : (doc.body[doc.body.length - 1] === '' ? [''] : []);
    // "## Seção", linha vazia e logo um título dentro: a linha vazia continua lá (Desfazer volta byte a byte)
    const velho = doc.body.slice(s.start, s.end), k = velho.findIndex(l => l.trim());
    const ini = k > 0 && /^#{1,6}[ \t]/.test(velho[k]) && /^#{1,6}[ \t]/.test(novo[0] || '') ? [''] : [];
    doc.body.splice(s.start, s.end - s.start, ...ini, ...novo, ...fim);
    return doc;
  }
  // não existe: cria dentro da mãe (ou no corpo)
  const mae = path.length > 1 ? acharSecao(doc, path.slice(0, -1)) : null;
  if (path.length > 1 && !mae) { gravarSecao(doc, path.slice(0, -1), ''); return gravarSecao(doc, path, content); }
  const level = mae ? mae.level + 1 : 2;
  let at;
  if (mae) {
    at = mae.end;
    const regra = path.length === 2 ? FILHAS[norm(path[0])] : null;
    if (regra) {
      const nome = norm(path[1]);
      const irmas = titulos(doc.body).filter(x => x.i >= mae.start && x.i < mae.end && x.level === mae.level + 1);
      const ultima = irmas.find(x => regra.ultimo.includes(norm(x.name)));
      const p = regra.primeiro.indexOf(nome);
      if (p >= 0) { const antes = regra.primeiro.slice(0, p); const dep = irmas.find(x => !antes.includes(norm(x.name))); if (dep) at = dep.i; }
      else if (!regra.ultimo.includes(nome) && ultima) at = ultima.i;
    }
  } else {
    // seções de cima na ordem do arquivo: entra antes da primeira que vem depois dela
    const k = ORDEM.indexOf(norm(path[0]));
    const depois = k >= 0 ? ORDEM.slice(k + 1).map(n => acharSecao(doc, [n])).find(Boolean) : null;
    at = depois ? depois.h : doc.body.length;
  }
  // ao final do arquivo, entra antes da última linha vazia (o \n final)
  let eof = false;
  if (at >= doc.body.length) { eof = true; at = doc.body.length; if (at > 0 && doc.body[at - 1] === '') at--; }
  const bloco = [];
  if (at > 0 && doc.body[at - 1].trim()) bloco.push('');
  bloco.push('#'.repeat(level) + ' ' + path[path.length - 1], ...novo);
  if (!eof) bloco.push('');
  doc.body.splice(at, 0, ...bloco);
  return doc;
}

/* ---------------- remendos (o que o app grava) ---------------- */
// patch = { fm: { chave: valor | null }, sec: { 'Bruto/Anotações': texto } }
// Nome de seção com "/" (uma pergunta, por exemplo) vai na chave feita por secao(...), que separa com \u001f.
const SEP = '\u001f';
export const secao = (...partes) => partes.join(SEP);
const partesDe = k => k.includes(SEP) ? k.split(SEP) : k.split('/');
export function aplicar(text, patch) {
  const doc = abrir(text);
  if (patch && patch.fm) for (const k of Object.keys(patch.fm)) gravarCampo(doc, k, patch.fm[k]);
  if (patch && patch.sec) for (const k of Object.keys(patch.sec)) gravarSecao(doc, partesDe(k), patch.sec[k]);
  return fechar(doc);
}

/* ---------------- títulos dentro de um texto ---------------- */
// títulos que fechariam a seção no arquivo descem para "min" (## dentro do Lapidado vira ###)
export function rebaixar(text, min) {
  let fence = false;
  return String(text).split('\n').map(l => {
    if (FENCE.test(l)) { fence = !fence; return l; }
    if (fence) return l;
    const m = l.match(/^(#{1,6})([ \t]+.*)$/);
    return m && m[1].length < min ? '#'.repeat(min) + m[2] : l;
  }).join('\n');
}
// desce todos os títulos juntos (mantém a hierarquia) até o menor ficar em "min"; nunca passa de ######
export function descer(text, min) {
  const linhas = String(text == null ? '' : text).split('\n');
  let fence = false, menor = 7;
  const eh = linhas.map(l => { if (FENCE.test(l)) { fence = !fence; return 0; } if (fence) return 0; const m = l.match(/^(#{1,6})[ \t]+/); return m ? m[1].length : 0; });
  eh.forEach(n => { if (n && n < menor) menor = n; });
  const d = menor < min ? min - menor : 0;
  if (!d) return linhas.join('\n');
  return linhas.map((l, i) => eh[i] ? '#'.repeat(Math.min(6, eh[i] + d)) + l.slice(eh[i]) : l).join('\n');
}

// a ordem das seções no remendo é a da última mudança: uma seção inteira gravada depois de uma resposta (ou o
// contrário) é reaplicada na mesma ordem em que ele mexeu
export function juntar(a, b) {
  const sec = Object.assign({}, a && a.sec);
  for (const k of Object.keys((b && b.sec) || {})) { delete sec[k]; sec[k] = b.sec[k]; }
  return { fm: Object.assign({}, a && a.fm, b && b.fm), sec };
}

/* ---------------- slug ---------------- */
export function slug(s, max = 40) {
  let out = String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (out.length > max) out = out.slice(0, max).replace(/-[^-]*$/, '') || out.slice(0, max);
  return out || 'direcao';
}

export function novaDirecao(titulo, ordem) {
  return `---\ntitulo: ${valorYaml(titulo)}\nordem: ${ordem}\n---\n\n## Bruto\n\n### Anotações\n\n## Lapidado\n`;
}
