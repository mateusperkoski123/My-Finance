// Frontend JS para o módulo Comunidade (Vanilla JS puro)

function getCsrfToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.getAttribute('content') : '';
}

// ---- Modais de Nova Postagem ----

function abrirModalNovaPostagem() {
    const backdrop = document.getElementById('modal-nova-postagem');
    if (!backdrop) return;
    backdrop.style.display = 'block';
    setTimeout(() => backdrop.classList.add('is-open'), 10);
    voltarPassoCategoria();
}

function fecharModalNovaPostagem() {
    const backdrop = document.getElementById('modal-nova-postagem');
    if (!backdrop) return;
    backdrop.classList.remove('is-open');
    setTimeout(() => { backdrop.style.display = 'none'; }, 200);
}

function selecionarCategoriaNova(cat) {
    document.getElementById('input-nova-categoria').value = cat;
    document.getElementById('step-categoria').style.display = 'none';
    document.getElementById('form-nova-postagem').style.display = 'block';

    const groupEsperado = document.getElementById('group-esperado');
    if (groupEsperado) {
        groupEsperado.style.display = cat === 'bug' ? 'block' : 'none';
    }

    // Preencher contexto de URL e User Agent
    const inputUrl = document.getElementById('input-contexto-url');
    if (inputUrl) {
        inputUrl.value = window.location.pathname.slice(0, 255);
    }
    const inputUa = document.getElementById('input-contexto-ua');
    if (inputUa) {
        inputUa.value = (navigator.userAgent || '').slice(0, 255);
    }
}

function voltarPassoCategoria() {
    const stepCat = document.getElementById('step-categoria');
    const formPost = document.getElementById('form-nova-postagem');
    if (stepCat && formPost) {
        stepCat.style.display = 'block';
        formPost.style.display = 'none';
    }
}

// Debounce para busca de similares ao digitar o título
let debounceTimerSimilares = null;
function aoDigitarTituloSimilares(val) {
    clearTimeout(debounceTimerSimilares);
    const box = document.getElementById('container-similares');
    const lista = document.getElementById('lista-similares');

    if (!val || val.trim().length < 4) {
        if (box) box.style.display = 'none';
        return;
    }

    debounceTimerSimilares = setTimeout(() => {
        fetch('/comunidade/similares?q=' + encodeURIComponent(val.trim()))
            .then(res => res.json())
            .then(similares => {
                if (!similares || similares.length === 0) {
                    box.style.display = 'none';
                    return;
                }
                lista.innerHTML = '';
                similares.forEach(item => {
                    const li = document.createElement('li');
                    const a = document.createElement('a');
                    a.href = '/comunidade/' + item.id;
                    a.textContent = item.titulo;
                    a.onclick = (e) => {
                        e.preventDefault();
                        fecharModalNovaPostagem();
                        abrirModalDetalhe(item.id);
                    };
                    li.appendChild(a);
                    lista.appendChild(li);
                });
                box.style.display = 'block';
            })
            .catch(() => {
                if (box) box.style.display = 'none';
            });
    }, 400);
}

// Preview e validação de imagens da nova postagem (máx 4 imagens, <= 2MB, formatos permitidos)
function previewImagensNovaPostagem(input) {
    const container = document.getElementById('preview-nova-thumbs');
    if (!container) return;
    container.innerHTML = '';

    const arquivos = Array.from(input.files || []);
    if (arquivos.length > 4) {
        alert(window.GF_T && window.GF_T.erro_acao ? 'Máximo 4 imagens permitidas.' : 'Máximo 4 imagens permitidas.');
        input.value = '';
        return;
    }

    const formatosPermitidos = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

    arquivos.forEach((file, index) => {
        if (file.size > 2 * 1024 * 1024) {
            alert(`A imagem "${file.name}" excede o tamanho máximo de 2MB.`);
            input.value = '';
            container.innerHTML = '';
            return;
        }
        if (!formatosPermitidos.includes(file.type.toLowerCase())) {
            alert(`Formato de imagem não suportado para "${file.name}". Permita apenas PNG, JPEG, WebP e GIF.`);
            input.value = '';
            container.innerHTML = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const div = document.createElement('div');
            div.className = 'comunidade-thumb-item';

            const img = document.createElement('img');
            img.src = e.target.result;
            img.alt = file.name;

            div.appendChild(img);
            container.appendChild(div);
        };
        reader.readAsDataURL(file);
    });
}

function enviarNovaPostagem(event) {
    event.preventDefault();
    const form = event.target;
    const btn = document.getElementById('btn-submit-postagem');

    if (btn) btn.disabled = true;

    const formData = new FormData(form);

    fetch('/comunidade', {
        method: 'POST',
        headers: {
            'X-CSRF-Token': getCsrfToken(), 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json'
        },
        body: formData
    })
    .then(async res => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.sucesso) {
            throw new Error(data.erro || data.mensagem || ('Erro ao publicar postagem (HTTP ' + res.status + ').'));
        }
        return data;
    })
    .then(data => {
        fecharModalNovaPostagem();
        if (data.id) {
            abrirModalDetalhe(data.id);
        } else {
            window.location.reload();
        }
    })
    .catch(err => {
        alert(err.message);
    })
    .finally(() => {
        if (btn) btn.disabled = false;
    });
}

// ---- Modal de Detalhe AJAX ----

function abrirModalDetalhe(id, pushState = true) {
    const backdrop = document.getElementById('modal-detalhe-post');
    const body = document.getElementById('modal-detalhe-body');
    if (!backdrop || !body) {
        window.location.href = '/comunidade/' + id;
        return;
    }

    body.innerHTML = '<div style="text-align: center; padding: 40px;"><i class="ph ph-spinner spinner" style="font-size: 32px;"></i></div>';
    backdrop.style.display = 'block';
    setTimeout(() => backdrop.classList.add('is-open'), 10);

    if (pushState) {
        history.pushState({ modalDetalheId: id }, '', '/comunidade/' + id);
    }

    fetch('/comunidade/' + id + '?parcial=1')
        .then(res => {
            if (!res.ok) throw new Error('Não foi possível carregar a postagem.');
            return res.text();
        })
        .then(html => {
            body.innerHTML = html;
        })
        .catch(err => {
            body.innerHTML = `<div class="alert alert-erro" style="margin: 20px;">${err.message}</div>`;
        });
}

function fecharModalDetalhe() {
    const backdrop = document.getElementById('modal-detalhe-post');
    if (!backdrop) return;
    backdrop.classList.remove('is-open');
    setTimeout(() => { backdrop.style.display = 'none'; }, 200);

    if (window.location.pathname.startsWith('/comunidade/')) {
        history.pushState(null, '', '/comunidade');
    }
}

window.addEventListener('popstate', (e) => {
    if (e.state && e.state.modalDetalheId) {
        abrirModalDetalhe(e.state.modalDetalheId, false);
    } else {
        const backdrop = document.getElementById('modal-detalhe-post');
        if (backdrop && backdrop.classList.contains('is-open')) {
            fecharModalDetalhe();
        }
    }
});

// ---- Interações: Voto, Importância, Seguir ----

function votarPost(id, btnElement, event) {
    if (event) event.stopPropagation();

    fetch('/comunidade/' + id + '/votar', {
        method: 'POST',
        headers: {
            'X-CSRF-Token': getCsrfToken(), 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json'
        }
    })
    .then(res => res.json())
    .then(data => {
        if (!data.sucesso) {
            alert(data.erro || 'Erro ao votar.');
            return;
        }

        // Atualizar todos os botões de voto do post na página
        const botoes = document.querySelectorAll(`[data-post-id="${id}"] .comunidade-voto-btn, button[onclick*="votarPost('${id}'"]`);
        botoes.forEach(btn => {
            if (data.votou) {
                btn.classList.add('is-votado', 'btn-success');
                btn.classList.remove('btn-outline');
            } else {
                btn.classList.remove('is-votado', 'btn-success');
                btn.classList.add('btn-outline');
            }
            const countSpan = btn.querySelector('.votos-count');
            if (countSpan) countSpan.textContent = data.votos;
        });
    })
    .catch(err => {
        alert(err.message);
    });
}

function selecionarImportancia(id, nivel, btnElement) {
    fetch('/comunidade/' + id + '/importancia', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-CSRF-Token': getCsrfToken(), 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json'
        },
        body: 'nivel=' + encodeURIComponent(nivel)
    })
    .then(res => res.json())
    .then(data => {
        if (!data.sucesso) {
            alert(data.erro || 'Erro ao definir importância.');
            return;
        }
        const container = btnElement.closest('.comunidade-importancia-botoes');
        if (container) {
            const btns = container.querySelectorAll('button');
            btns.forEach((b, idx) => {
                if ((idx + 1) === data.nivel) {
                    b.classList.remove('btn-outline');
                    b.classList.add('btn-primary');
                } else {
                    b.classList.remove('btn-primary');
                    b.classList.add('btn-outline');
                }
            });
        }
    })
    .catch(err => alert(err.message));
}

function alternarSeguir(id, btnElement) {
    fetch('/comunidade/' + id + '/seguir', {
        method: 'POST',
        headers: {
            'X-CSRF-Token': getCsrfToken(), 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json'
        }
    })
    .then(res => res.json())
    .then(data => {
        if (!data.sucesso) {
            alert(data.erro || 'Erro ao alternar inscrição.');
            return;
        }
        const span = btnElement.querySelector('span');
        const icon = btnElement.querySelector('i');
        if (data.seguiu) {
            btnElement.classList.remove('btn-primary');
            btnElement.classList.add('btn-outline');
            if (span) span.textContent = 'Deixar de seguir';
            if (icon) icon.className = 'ph ph-bell-slash';
        } else {
            btnElement.classList.remove('btn-outline');
            btnElement.classList.add('btn-primary');
            if (span) span.textContent = 'Ser notificado';
            if (icon) icon.className = 'ph ph-bell';
        }
    })
    .catch(err => alert(err.message));
}

// ---- Abas de Detalhe: Comentários / Atividades ----

function trocarAbaDetalhe(aba) {
    const btnCom = document.getElementById('tab-btn-comentarios');
    const btnAtiv = document.getElementById('tab-btn-atividades');
    const pCom = document.getElementById('painel-comentarios');
    const pAtiv = document.getElementById('painel-atividades');

    if (!btnCom || !btnAtiv || !pCom || !pAtiv) return;

    if (aba === 'comentarios') {
        btnCom.classList.add('is-active');
        btnAtiv.classList.remove('is-active');
        pCom.classList.add('is-active');
        pAtiv.classList.remove('is-active');
    } else {
        btnAtiv.classList.add('is-active');
        btnCom.classList.remove('is-active');
        pAtiv.classList.add('is-active');
        pCom.classList.remove('is-active');
    }
}

// Preview de imagens em comentário (máx 2)
function previewImagensComentario(input) {
    const countSpan = document.getElementById('preview-comentario-count');
    const thumbsContainer = document.getElementById('preview-comentario-thumbs');
    if (thumbsContainer) thumbsContainer.innerHTML = '';

    const arquivos = Array.from(input.files || []);
    if (arquivos.length > 2) {
        alert('Máximo 2 imagens por comentário.');
        input.value = '';
        if (countSpan) countSpan.textContent = '';
        return;
    }

    if (countSpan) {
        countSpan.textContent = arquivos.length > 0 ? `${arquivos.length} imagem(ns)` : '';
    }

    const formatosPermitidos = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    arquivos.forEach(file => {
        if (file.size > 2 * 1024 * 1024 || !formatosPermitidos.includes(file.type.toLowerCase())) {
            alert(`Imagem "${file.name}" inválida ou > 2MB.`);
            input.value = '';
            if (countSpan) countSpan.textContent = '';
            if (thumbsContainer) thumbsContainer.innerHTML = '';
            return;
        }
        if (thumbsContainer) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const div = document.createElement('div');
                div.className = 'comunidade-thumb-item';
                const img = document.createElement('img');
                img.src = e.target.result;
                div.appendChild(img);
                thumbsContainer.appendChild(div);
            };
            reader.readAsDataURL(file);
        }
    });
}

function enviarComentario(id, event) {
    event.preventDefault();
    const form = event.target;
    const btn = document.getElementById('btn-enviar-comentario');
    if (btn) btn.disabled = true;

    const formData = new FormData(form);

    fetch('/comunidade/' + id + '/comentarios', {
        method: 'POST',
        headers: {
            'X-CSRF-Token': getCsrfToken(), 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json'
        },
        body: formData
    })
    .then(async res => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.sucesso) {
            throw new Error(data.erro || data.mensagem || 'Erro ao enviar comentário.');
        }
        return data;
    })
    .then(data => {
        form.reset();
        const thumbs = document.getElementById('preview-comentario-thumbs');
        const countSpan = document.getElementById('preview-comentario-count');
        if (thumbs) thumbs.innerHTML = '';
        if (countSpan) countSpan.textContent = '';

        const emptyMsg = document.getElementById('empty-comentarios');
        if (emptyMsg) emptyMsg.remove();

        const lista = document.getElementById('lista-comentarios');
        if (lista && data.html) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = data.html;
            lista.appendChild(tempDiv.firstElementChild);
        }
    })
    .catch(err => alert(err.message))
    .finally(() => {
        if (btn) btn.disabled = false;
    });
}

function excluirComentario(id, event) {
    if (event) event.stopPropagation();
    if (!confirm('Tem certeza que deseja excluir este comentário?')) return;

    fetch('/comunidade/comentarios/' + id + '/excluir', {
        method: 'POST',
        headers: {
            'X-CSRF-Token': getCsrfToken(), 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json'
        }
    })
    .then(res => res.json())
    .then(data => {
        if (!data.sucesso) {
            alert(data.erro || 'Erro ao excluir comentário.');
            return;
        }
        const elem = document.getElementById('comentario-' + id);
        if (elem) elem.remove();
    })
    .catch(err => alert(err.message));
}

// ---- Exclusão de Post ----

function excluirPostAutor(id) {
    if (!confirm('Tem certeza que deseja excluir sua postagem?')) return;

    fetch('/comunidade/' + id + '/excluir', {
        method: 'POST',
        headers: {
            'X-CSRF-Token': getCsrfToken(), 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json'
        }
    })
    .then(res => res.json())
    .then(data => {
        if (!data.sucesso) {
            alert(data.erro || 'Não foi possível excluir.');
            return;
        }
        window.location.href = '/comunidade';
    })
    .catch(err => alert(err.message));
}

// ---- Moderação de Administrador ----

function alterarStatusAdmin(id, event) {
    event.preventDefault();
    const select = document.getElementById('admin-status-select');
    if (!select) return;

    fetch('/admin/comunidade/' + id + '/estado', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-CSRF-Token': getCsrfToken(), 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json'
        },
        body: 'status=' + encodeURIComponent(select.value)
    })
    .then(res => res.json())
    .then(data => {
        if (!data.sucesso) {
            alert(data.erro || 'Erro ao alterar status.');
            return;
        }
        abrirModalDetalhe(id, false);
    })
    .catch(err => alert(err.message));
}

function alterarCategoriaAdmin(id, event) {
    event.preventDefault();
    const select = document.getElementById('admin-cat-select');
    if (!select) return;

    fetch('/admin/comunidade/' + id + '/categoria', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-CSRF-Token': getCsrfToken(), 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json'
        },
        body: 'categoria=' + encodeURIComponent(select.value)
    })
    .then(res => res.json())
    .then(data => {
        if (!data.sucesso) {
            alert(data.erro || 'Erro ao alterar categoria.');
            return;
        }
        abrirModalDetalhe(id, false);
    })
    .catch(err => alert(err.message));
}

function alternarOcultoAdmin(id) {
    fetch('/admin/comunidade/' + id + '/ocultar', {
        method: 'POST',
        headers: {
            'X-CSRF-Token': getCsrfToken(), 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json'
        }
    })
    .then(res => res.json())
    .then(data => {
        if (!data.sucesso) {
            alert(data.erro || 'Erro ao alterar visibilidade.');
            return;
        }
        abrirModalDetalhe(id, false);
    })
    .catch(err => alert(err.message));
}

function excluirPostAdmin(id) {
    if (!confirm('Tem certeza que deseja excluir definitivamente esta postagem como admin?')) return;

    fetch('/admin/comunidade/' + id + '/excluir', {
        method: 'POST',
        headers: {
            'X-CSRF-Token': getCsrfToken(), 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json'
        }
    })
    .then(res => res.json())
    .then(data => {
        if (!data.sucesso) {
            alert(data.erro || 'Erro ao excluir postagem.');
            return;
        }
        window.location.href = '/comunidade';
    })
    .catch(err => alert(err.message));
}

// ---- Lightbox / Visualizador de Imagem Ampliada ----

function abrirVisualizadorImagem(url) {
    const backdrop = document.getElementById('modal-lightbox');
    const img = document.getElementById('lightbox-img');
    if (backdrop && img) {
        img.src = url;
        backdrop.style.display = 'block';
    }
}

function fecharVisualizadorImagem() {
    const backdrop = document.getElementById('modal-lightbox');
    if (backdrop) {
        backdrop.style.display = 'none';
    }
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        fecharVisualizadorImagem();
        fecharModalNovaPostagem();
        fecharModalDetalhe();
    }
});
