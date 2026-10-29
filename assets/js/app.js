(function () {
    const form = document.getElementById('form-upload');
    const dropzone = document.getElementById('dropzone');
    const input = document.getElementById('arquivo');
    const camera = document.getElementById('camera-nativa');
    const botaoCamera = document.getElementById('btn-camera');
    const visor = document.getElementById('visor');
    const video = document.getElementById('visor-video');
    const avisoVisor = document.getElementById('visor-aviso');
    const setor = document.getElementById('setor');
    const nomeArquivo = document.getElementById('arquivo-nome');
    const botaoLer = document.getElementById('btn-ler');
    const statusBox = document.getElementById('status');
    const review = document.getElementById('review');
    const preview = document.getElementById('preview-col');
    const tabelaWrap = document.getElementById('tabela-wrap');
    const setorRevisao = document.getElementById('setor-revisao');
    const confirmacao = document.getElementById('confirmacao');
    const confirmar = document.getElementById('confirmar');
    const resultado = document.getElementById('resultado');
    const limiar = Number(window.APP.limiar || 0.75);
    let atual = null;
    let misto = false;
    let fluxo = null;
    let lente = 'environment';

    botaoCamera.addEventListener('click', function () {
        if (prefereCameraDoAparelho()) {
            camera.click();
            return;
        }
        abrirVisor();
    });

    camera.addEventListener('change', function () {
        const foto = camera.files && camera.files[0];
        camera.value = '';
        if (!foto) return;
        receberFoto(foto);
    });

    document.getElementById('visor-fechar').addEventListener('click', fecharVisor);
    document.getElementById('visor-disparo').addEventListener('click', disparar);
    document.getElementById('visor-trocar').addEventListener('click', function () {
        lente = lente === 'environment' ? 'user' : 'environment';
        abrirVisor();
    });
    window.addEventListener('pagehide', fecharVisor);

    form.addEventListener('submit', function (event) {
        event.preventDefault();
        if (!input.files || !input.files[0]) {
            mostrarStatus('warning', 'Selecione um arquivo para leitura.');
            return;
        }
        enviar(input.files[0]);
    });

    input.addEventListener('change', function () {
        nomeArquivo.textContent = input.files[0] ? input.files[0].name : 'Nenhum arquivo selecionado';
    });

    ['dragenter', 'dragover'].forEach(function (evento) {
        dropzone.addEventListener(evento, function (event) {
            event.preventDefault();
            dropzone.classList.add('is-over');
        });
    });
    ['dragleave', 'drop'].forEach(function (evento) {
        dropzone.addEventListener(evento, function (event) {
            event.preventDefault();
            dropzone.classList.remove('is-over');
        });
    });
    dropzone.addEventListener('drop', function (event) {
        const arquivo = event.dataTransfer && event.dataTransfer.files[0];
        if (!arquivo) {
            return;
        }
        const transferencia = new DataTransfer();
        transferencia.items.add(arquivo);
        input.files = transferencia.files;
        nomeArquivo.textContent = arquivo.name;
        enviar(arquivo);
    });

    document.getElementById('btn-gravar').addEventListener('click', function () {
        gravar(false);
    });
    document.getElementById('btn-exportar').addEventListener('click', function () {
        window.print();
    });
    document.getElementById('btn-linha').addEventListener('click', adicionarLinha);
    confirmar.addEventListener('change', atualizarBotoes);
    setorRevisao.addEventListener('change', function () {
        if (atual && atual.linhas) montarTabela(atual.linhas);
        atualizarDestaque();
    });
    tabelaWrap.addEventListener('input', atualizarDestaque);

    function prefereCameraDoAparelho() {
        const toque = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
        const movel = /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || '');
        const semApi = !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia;
        return Boolean(toque || movel || window.isSecureContext === false || semApi);
    }

    function receberFoto(foto) {
        mostrarStatus('info', 'Preparando a foto para leitura.');
        prepararFoto(foto).then(function (pronta) {
            nomeArquivo.textContent = 'Foto da câmera';
            enviar(pronta);
        }).catch(function () {
            mostrarStatus('danger', 'Não foi possível usar esta foto. Tente de novo.');
        });
    }

    function prepararFoto(foto) {
        return new Promise(function (resolve, reject) {
            const origem = URL.createObjectURL(foto);
            const imagem = new Image();
            imagem.onload = function () {
                try {
                    const limite = 2000;
                    const largura = imagem.naturalWidth || imagem.width;
                    const altura = imagem.naturalHeight || imagem.height;
                    const escala = Math.min(1, limite / Math.max(largura, altura));
                    const canvas = document.createElement('canvas');
                    canvas.width = Math.max(1, Math.round(largura * escala));
                    canvas.height = Math.max(1, Math.round(altura * escala));
                    canvas.getContext('2d').drawImage(imagem, 0, 0, canvas.width, canvas.height);
                    URL.revokeObjectURL(origem);
                    canvas.toBlob(function (blob) {
                        if (!blob) {
                            resolverOriginal();
                            return;
                        }
                        resolve(new File([blob], 'conferencia.jpg', { type: 'image/jpeg' }));
                    }, 'image/jpeg', 0.85);
                } catch (erro) {
                    URL.revokeObjectURL(origem);
                    resolverOriginal();
                }
            };
            imagem.onerror = function () {
                URL.revokeObjectURL(origem);
                resolverOriginal();
            };
            function resolverOriginal() {
                if (foto.size > 0 && foto.size <= 15 * 1024 * 1024) resolve(foto);
                else reject(new Error('foto'));
            }
            imagem.src = origem;
        });
    }

    function abrirVisor() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            camera.click();
            return;
        }
        pararFluxo();
        visor.hidden = false;
        avisoVisor.hidden = true;
        navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: { ideal: lente } }
        }).then(function (stream) {
            fluxo = stream;
            video.srcObject = stream;
            const reproduzir = video.play();
            if (reproduzir && reproduzir.catch) reproduzir.catch(function () {});
        }).catch(function () {
            fecharVisor();
            mostrarStatus('warning', 'A câmera não abriu neste navegador. Escolha a foto na janela que aparecer.');
            camera.click();
        });
    }

    function disparar() {
        if (!video.videoWidth) return;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);
        canvas.toBlob(function (blob) {
            fecharVisor();
            if (!blob) {
                mostrarStatus('danger', 'Não foi possível capturar a foto.');
                return;
            }
            receberFoto(new File([blob], 'conferencia.jpg', { type: 'image/jpeg' }));
        }, 'image/jpeg', 0.92);
    }

    function fecharVisor() {
        pararFluxo();
        if (visor) visor.hidden = true;
    }

    function pararFluxo() {
        if (!fluxo) return;
        fluxo.getTracks().forEach(function (trilha) { trilha.stop(); });
        fluxo = null;
        if (video) video.srcObject = null;
    }

    function nomeEnvio(arquivo) {
        const nome = arquivo && arquivo.name ? arquivo.name : '';
        if (/\.(jpe?g|png|pdf|csv|xlsx|xls)$/i.test(nome)) return nome;
        return arquivo && arquivo.type === 'image/png' ? 'conferencia.png' : 'conferencia.jpg';
    }

    function enviar(arquivo) {
        if (arquivo.size > 15 * 1024 * 1024) {
            mostrarStatus('warning', 'O arquivo precisa ter até 15 MB.');
            return;
        }
        const dados = new FormData();
        dados.append('arquivo', arquivo, nomeEnvio(arquivo));
        dados.append('setor', setor.value);
        botaoLer.disabled = true;
        botaoCamera.disabled = true;
        mostrarStatus('info', 'Lendo o arquivo. Planilhas levam poucos segundos; fotos podem demorar mais.');
        fetch('upload.php', { method: 'POST', body: dados })
            .then(lerJson)
            .then(function (resposta) {
                if (!resposta.ok) {
                    throw new Error(resposta.erro || 'Não foi possível ler o arquivo.');
                }
                atual = resposta;
                renderizar(resposta);
            })
            .catch(function (erro) {
                mostrarStatus('danger', erro.message);
            })
            .finally(function () {
                botaoLer.disabled = false;
                botaoCamera.disabled = false;
            });
    }

    function renderizar(dados) {
        const fontes = { planilha: 'Planilha', pdf: 'PDF', imagem: 'Imagem' };
        const meta = document.getElementById('review-meta');
        const percentual = Math.round((Number(dados.confianca_geral) || 0) * 100);
        meta.textContent = (fontes[dados.fonte] || 'Arquivo') + ' · confiança média ' + percentual + '%';
        if (dados.avisos && dados.avisos.length) {
            mostrarLista('warning', dados.avisos);
        } else {
            statusBox.hidden = true;
        }
        montarPreview(dados);
        misto = setoresDiferentes(dados.linhas);
        preencherSetores(dados);
        montarTabela(dados.linhas);
        confirmar.checked = false;
        resultado.hidden = true;
        review.hidden = false;
        atualizarDestaque();
        review.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function montarPreview(dados) {
        preview.replaceChildren();
        if (dados.preview_url && dados.preview_tipo === 'imagem') {
            const imagem = document.createElement('img');
            imagem.className = 'preview-imagem';
            imagem.alt = 'Arquivo enviado para conferência';
            imagem.src = dados.preview_url;
            preview.appendChild(imagem);
            return;
        }
        if (dados.preview_url && dados.preview_tipo === 'pdf') {
            const frame = document.createElement('iframe');
            frame.className = 'preview-pdf';
            frame.title = 'PDF enviado';
            frame.src = dados.preview_url;
            preview.appendChild(frame);
            return;
        }
        const texto = document.createElement('p');
        texto.textContent = dados.nome_original ? 'Planilha recebida: ' + dados.nome_original : 'Planilha recebida.';
        preview.appendChild(texto);
    }

    function preencherSetores(dados) {
        setorRevisao.replaceChildren();
        const automatico = document.createElement('option');
        automatico.value = '';
        automatico.textContent = misto ? 'Usar o setor de cada linha' : 'Selecione o setor';
        setorRevisao.appendChild(automatico);
        Object.entries(window.APP.setores).forEach(function (par) {
            const opcao = document.createElement('option');
            opcao.value = par[0];
            opcao.textContent = par[1];
            setorRevisao.appendChild(opcao);
        });
        const detectado = dados.setor_detectado || '';
        if (!misto && detectado && window.APP.setores[detectado]) {
            setorRevisao.value = detectado;
        }
    }

    function setoresDiferentes(linhas) {
        const setores = new Set(linhas.map(function (linha) {
            return linha.setor && linha.setor.valor ? linha.setor.valor : '';
        }).filter(Boolean));
        return setores.size > 1;
    }

    function gravar(exportar) {
        if (!atual) return;
        const coleta = coletar();
        if (!coleta.linhas.length) {
            mostrarStatus('warning', 'Não há linhas para gravar.');
            return;
        }
        if (coleta.erros.length) {
            mostrarLista('danger', coleta.erros);
            return;
        }
        if (!confirmacao.hidden && !confirmar.checked) {
            mostrarStatus('warning', 'Confirme a revisão dos campos em amarelo.');
            return;
        }
        const botao = document.getElementById(exportar ? 'btn-exportar' : 'btn-gravar');
        botao.disabled = true;
        fetch('process.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                arquivo: atual.arquivo || '',
                confirmar_baixa_confianca: confirmar.checked,
                linhas: coleta.linhas
            })
        })
            .then(lerJson)
            .then(function (resposta) {
                if (!resposta.ok) {
                    const mensagens = resposta.erros && resposta.erros.length ? resposta.erros : [resposta.erro || 'Não foi possível gravar.'];
                    mostrarLista('danger', mensagens);
                    return;
                }
                mostrarResultado(resposta, exportar);
            })
            .catch(function (erro) {
                mostrarStatus('danger', erro.message);
            })
            .finally(function () {
                atualizarBotoes();
            });
    }

    function montarTabela(linhas) {
        Documento.montar(tabelaWrap, { linhas: linhas, setor: setorRevisao.value, limiar: limiar });
    }

    function adicionarLinha() {
        Documento.adicionar(tabelaWrap, setorRevisao.value);
        atualizarDestaque();
    }

    function atualizarDestaque() {
        const baixas = Documento.destacar(tabelaWrap, limiar);
        confirmacao.hidden = baixas === 0;
        if (baixas === 0) confirmar.checked = false;
        atualizarBotoes();
    }

    function atualizarBotoes() {
        document.getElementById('btn-gravar').disabled = !confirmacao.hidden && !confirmar.checked;
    }

    function coletar() {
        return Documento.coletar(tabelaWrap, setorRevisao.value);
    }

    function mostrarResultado(resposta) {
        resultado.hidden = false;
        resultado.className = 'alert alert-success';
        resultado.replaceChildren();
        const texto = document.createElement('p');
        texto.textContent = resposta.gravados + ' linha(s) gravada(s).';
        resultado.appendChild(texto);
        if (resposta.avisos && resposta.avisos.length) {
            const lista = document.createElement('ul');
            resposta.avisos.forEach(function (aviso) {
                const item = document.createElement('li');
                item.textContent = aviso;
                lista.appendChild(item);
            });
            resultado.appendChild(lista);
        }
        const documento = document.createElement('a');
        documento.href = resposta.documento_url || resposta.dashboard_url;
        documento.textContent = 'Abrir o documento';
        documento.className = 'btn btn-sm btn-primary me-2';
        resultado.appendChild(documento);
        const painel = document.createElement('a');
        painel.href = resposta.dashboard_url;
        painel.textContent = 'Abrir o painel';
        painel.className = 'btn btn-sm btn-outline-primary me-2';
        resultado.appendChild(painel);
        mostrarStatus('success', 'Conferência gravada no documento padrão.');
    }

    function exibirData(valor) {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor || '');
        return match ? match[3] + '/' + match[2] + '/' + match[1] : (valor || '');
    }

    function mostrarStatus(tipo, mensagem) {
        statusBox.className = 'alert alert-' + tipo;
        statusBox.textContent = mensagem;
        statusBox.hidden = false;
    }

    function mostrarLista(tipo, mensagens) {
        statusBox.className = 'alert alert-' + tipo;
        statusBox.replaceChildren();
        const lista = document.createElement('ul');
        lista.className = 'mb-0';
        mensagens.forEach(function (mensagem) {
            const item = document.createElement('li');
            item.textContent = mensagem;
            lista.appendChild(item);
        });
        statusBox.appendChild(lista);
        statusBox.hidden = false;
    }

    function lerJson(resposta) {
        return resposta.text().then(function (texto) {
            try {
                return JSON.parse(texto);
            } catch (erro) {
                throw new Error('O servidor não devolveu uma resposta válida.');
            }
        });
    }
})();
