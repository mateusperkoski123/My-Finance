// Checagem rapida antes de publicar (npm run checar). Nao precisa de banco nem de internet.
//   1. Sintaxe de todos os .js do servidor e do navegador
//   2. Textos: toda chave literal usada em t('...') existe em pt, es e en
//   3. Telas: todo render('...') e include('...') aponta para um .ejs que existe
//   4. Migrations: nenhum numero repetido (varias sessoes ja criaram o mesmo numero)
// Sai com codigo 1 se achar algum problema.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const RAIZ = path.resolve(__dirname, '..');
const IGNORAR = new Set(['node_modules', '.git', 'dist-landing', 'MyERP', 'backups', 'scratch', 'storage']);
const problemas = [];

function listar(dir, exts, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const nome of fs.readdirSync(dir)) {
        if (IGNORAR.has(nome)) continue;
        const p = path.join(dir, nome);
        if (fs.statSync(p).isDirectory()) listar(p, exts, out);
        else if (exts.some((e) => nome.endsWith(e))) out.push(p);
    }
    return out;
}
const rel = (p) => path.relative(RAIZ, p).split(path.sep).join('/');

// 1) Sintaxe
const arquivosJs = [path.join(RAIZ, 'server.js'), ...listar(path.join(RAIZ, 'src'), ['.js']), ...listar(path.join(RAIZ, 'public', 'assets', 'js'), ['.js'])];
for (const f of arquivosJs) {
    const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
    if (r.status !== 0) problemas.push(`Sintaxe: ${rel(f)}: ${(r.stderr || '').split(/\r?\n/).filter(Boolean).slice(0, 3).join(' | ')}`);
}

// 2) Textos nos 3 idiomas
const i18n = require(path.join(RAIZ, 'src', 'node', 'core', 'i18n.js'));
const fontes = [path.join(RAIZ, 'server.js'), ...listar(path.join(RAIZ, 'src'), ['.js']), ...listar(path.join(RAIZ, 'views'), ['.ejs'])];
const reChave = /\b(?:t|tr|req\.t|res\.locals\.t)\(\s*'([a-zA-Z0-9_.\-]+)'/g;
let chavesUsadas = 0;
const vistas = new Set();
for (const f of fontes) {
    const txt = fs.readFileSync(f, 'utf8');
    let m;
    while ((m = reChave.exec(txt))) {
        const k = m[1];
        // Sem ponto nao e chave de traducao; terminada em . ou _ e prefixo montado no codigo (ex.: 'plano.' + codigo).
        if (!k.includes('.') || /[._]$/.test(k) || vistas.has(k)) continue;
        vistas.add(k);
        chavesUsadas++;
        const faltam = [['pt', i18n.ptBR], ['es', i18n.esPY], ['en', i18n.enUS]].filter(([, d]) => !(k in d)).map(([l]) => l);
        if (faltam.length) problemas.push(`Texto sem traducao (${faltam.join(', ')}): ${k} em ${rel(f)}`);
    }
}

// 3) Telas
const reRender = /\brender\(\s*'([^']+)'/g;
for (const f of [path.join(RAIZ, 'server.js'), ...listar(path.join(RAIZ, 'src'), ['.js'])]) {
    const txt = fs.readFileSync(f, 'utf8');
    let m;
    while ((m = reRender.exec(txt))) {
        const v = path.join(RAIZ, 'views', m[1].endsWith('.ejs') ? m[1] : m[1] + '.ejs');
        if (!fs.existsSync(v)) problemas.push(`Tela inexistente: ${m[1]} (render em ${rel(f)})`);
    }
}
const reInclude = /\binclude\(\s*'([^']+)'/g;
const comExt = (p) => (p.endsWith('.ejs') ? p : p + '.ejs');
for (const f of listar(path.join(RAIZ, 'views'), ['.ejs'])) {
    const txt = fs.readFileSync(f, 'utf8');
    let m;
    while ((m = reInclude.exec(txt))) {
        // O EJS procura primeiro ao lado da tela e depois na pasta views.
        const ok = fs.existsSync(comExt(path.join(path.dirname(f), m[1]))) || fs.existsSync(comExt(path.join(RAIZ, 'views', m[1])));
        if (!ok) problemas.push(`Trecho de tela inexistente: ${m[1]} (include em ${rel(f)})`);
    }
}

// 4) Migrations com numero repetido
const porNumero = {};
for (const nome of fs.readdirSync(path.join(RAIZ, 'database', 'migrations')).filter((n) => n.endsWith('.sql'))) {
    const num = nome.split('_')[0];
    (porNumero[num] = porNumero[num] || []).push(nome);
}
for (const [num, nomes] of Object.entries(porNumero)) {
    if (nomes.length > 1) problemas.push(`Migration com numero repetido ${num}: ${nomes.join(', ')}`);
}

console.log(`Arquivos JS: ${arquivosJs.length} | chaves de texto: ${chavesUsadas} | migrations: ${Object.keys(porNumero).length}`);
if (problemas.length) {
    console.log(`\n${problemas.length} problema(s):`);
    problemas.forEach((p) => console.log(' - ' + p));
    process.exit(1);
}
console.log('Tudo certo.');
