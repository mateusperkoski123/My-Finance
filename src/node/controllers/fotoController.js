const FotoPerfil = require('../models/FotoPerfil');
const { dimensoesImagem } = require('../core/ia_midia');

const MAX_BYTES = 512 * 1024; // o navegador ja envia a foto reduzida (256x256, poucos KB); isto e so um teto
const MIN_LADO = 32;
const MAX_LADO = 2048;

// Tipo real pelos primeiros bytes (nao confia no nome nem no Content-Type enviados). So JPEG, PNG e WebP: nada de SVG/HTML.
function tipoImagem(b) {
    // Alem do cabecalho, confere o fim do arquivo: imagem truncada ou com lixo no final nao e aceita.
    if (b.length > 12 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
        return b[b.length - 2] === 0xff && b[b.length - 1] === 0xd9 ? 'image/jpeg' : null;
    }
    if (b.length > 24 && b[0] === 0x89 && b.toString('ascii', 1, 4) === 'PNG') {
        const iend = Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
        return b.subarray(b.length - 12).equals(iend) ? 'image/png' : null;
    }
    if (b.length > 16 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
        return b.readUInt32LE(4) + 8 === b.length ? 'image/webp' : null;
    }
    return null;
}

const fotoController = {
    // GET /perfil/foto - somente a foto do proprio usuario logado
    ver: async (req, res) => {
        try {
            const foto = await FotoPerfil.obter(req.user.id);
            if (!foto) return res.status(404).end();
            res.setHeader('Content-Type', foto.mime);
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('Content-Disposition', 'inline');
            res.setHeader('Cache-Control', 'private, max-age=86400'); // a URL muda (?v=) quando a foto muda
            return res.send(foto.dados);
        } catch (err) {
            console.error('Erro ao ler foto de perfil:', err.message);
            return res.status(500).end();
        }
    },

    // POST /perfil/foto (multipart, campo "foto")
    salvar: async (req, res) => {
        try {
            const arquivo = req.file;
            if (!arquivo || !arquivo.buffer || !arquivo.buffer.length) return res.status(400).json({ sucesso: false, erro: 'foto_ausente' });
            if (arquivo.buffer.length > MAX_BYTES) return res.status(413).json({ sucesso: false, erro: 'foto_grande' });
            const mime = tipoImagem(arquivo.buffer);
            if (!mime) return res.status(400).json({ sucesso: false, erro: 'foto_tipo' });
            const d = dimensoesImagem(arquivo.buffer);
            if (!d || d.w < MIN_LADO || d.h < MIN_LADO || d.w > MAX_LADO || d.h > MAX_LADO) return res.status(400).json({ sucesso: false, erro: 'foto_dimensao' });
            await FotoPerfil.salvar(req.user.id, mime, arquivo.buffer);
            return res.json({ sucesso: true, url: '/perfil/foto?v=' + Date.now() });
        } catch (err) {
            console.error('Erro ao salvar foto de perfil:', err.message);
            return res.status(500).json({ sucesso: false, erro: 'erro_interno' });
        }
    },

    // POST /perfil/foto/remover
    remover: async (req, res) => {
        try {
            await FotoPerfil.remover(req.user.id);
            return res.json({ sucesso: true });
        } catch (err) {
            console.error('Erro ao remover foto de perfil:', err.message);
            return res.status(500).json({ sucesso: false, erro: 'erro_interno' });
        }
    }
};

module.exports = fotoController;
