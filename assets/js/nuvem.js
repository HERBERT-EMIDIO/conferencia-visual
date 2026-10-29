(function () {
    const CHAVE = 'conferencia.visual.lancamentos';
    const limiar = 0.75;
    let linhasAtuais = [];

    const statusBox = document.getElementById('status');
    const review = document.getElementById('review');
    const preview = document.getElementById('preview-col');
    const tabelaWrap = document.getElementById('tabela-wrap');
    const setorRevisao = document.getElementById('setor-revisao');
    const confirmacao = document.getElementById('confirmacao');
    const confirmar = document.getElementById('confirmar');
    const resultado = document.getElementById('resultado');

    document.querySelectorAll('[data-tela]').forEach(function (link) {
        link.addEventListener('click', function (event) {
            event.preventDefault();
            mostrarTela(link.dataset.tela);
        });
    });

    document.getElementById('btn-camera').addEventListener('click', function () {
        document.getElementById('camera-nativa').click();
    });
    document.getElementById('camera-nativa').addEventListener('change', function (event) {
        const foto = event.target.files && event.target.files[0];
        event.target.value = '';
        if (foto) receber(foto);
    });
    document.getElementById('arquivo').addEventListener('change', function (event) {
        const arquivo = event.target.files && event.target.files[0];
        document.getElementById('arquivo-nome').textContent = arquivo ? arquivo.name : 'Nenhum arquivo selecionado';
        if (arquivo) receber(arquivo);
    });
    document.getElementById('btn-linha').addEventListener('click', function () {
        Documento.adicionar(tabelaWrap, setorRevisao.value);
        atualizarDestaque();
    });
    document.getElementById('btn-imprimir').addEventListener('click', function () { window.print(); });
    document.getElementById('btn-gravar').addEventListener('click', gravar);
    document.getElementById('btn-csv').addEventListener('click', baixarCsv);
    confirmar.addEventListener('change', atualizarBotao);
    setorRevisao.addEventListener('change', function () {
        abrirDocumento(setorRevisao.value, '', linhasAtuais);
    });
    tabelaWrap.addEventListener('input', atualizarDestaque);
    document.getElementById('form-branco').addEventListener('submit', function (event) {
        event.preventDefault();
        linhasAtuais = [];
        preview.replaceChildren();
        abrirDocumento(document.getElementById('branco-setor').value, document.getElementById('branco-data').value, []);
    });

    fetch('services/modelo.json')
        .then(function (resposta) { return resposta.json(); })
        .then(function (modelo) {
            window.APP = {
                setores: modelo.setores,
                campos: modelo.campos,
                grupos: modelo.grupos,
                leitos: modelo.leitos,
                modulos: modelo.modulos,
                perfis: modelo.perfis,
                limiar: limiar
            };
            preencherSelect(document.getElementById('setor'), 'Detectar automaticamente');
            preencherSelect(document.getElementById('branco-setor'), '');
            preencherSelect(setorRevisao, 'Selecione o setor');
            document.getElementById('branco-data').value = hoje();
            mostrarTela('leitura');
        })
        .catch(function () {
            mostrarStatus('danger', 'Não foi possível carregar o modelo dos setores.');
        });

    function preencherSelect(select, rotuloVazio) {
        select.replaceChildren();
        if (rotuloVazio) {
            const vazio = document.createElement('option');
            vazio.value = '';
            vazio.textContent = rotuloVazio;
            select.appendChild(vazio);
        }
        Object.entries(window.APP.setores).forEach(function (par) {
            const opcao = document.createElement('option');
            opcao.value = par[0];
            opcao.textContent = par[1];
            select.appendChild(opcao);
        });
    }

    function receber(arquivo) {
        const nome = (arquivo.name || '').toLowerCase();
        if (arquivo.type.indexOf('image/') === 0 || /\.(jpe?g|png|webp)$/.test(nome)) {
            lerFoto(arquivo);
            return;
        }
        if (nome.endsWith('.csv') || nome.endsWith('.txt') || arquivo.type.indexOf('text/') === 0) {
            const leitor = new FileReader();
            leitor.onload = function () {
                const lidas = lerCsv(String(leitor.result || ''));
                publicar(lidas.linhas, lidas.setor, 'Planilha', arquivo.name);
            };
            leitor.readAsText(arquivo);
            return;
        }
        mostrarStatus('warning', 'Neste link use a foto ou um CSV. PDF e Excel continuam na instalação do servidor.');
    }

    function lerFoto(arquivo) {
        preview.replaceChildren();
        const imagem = document.createElement('img');
        imagem.className = 'preview-imagem';
        imagem.alt = 'Foto da conferência';
        imagem.src = URL.createObjectURL(arquivo);
        preview.appendChild(imagem);
        mostrarStatus('info', 'Lendo a foto neste aparelho. A primeira vez pode demorar para baixar o leitor.');
        if (!window.Tesseract) {
            publicar([], document.getElementById('setor').value, 'Imagem', '');
            mostrarStatus('warning', 'O leitor de foto não carregou. Complete o documento manualmente.');
            return;
        }
        Tesseract.recognize(arquivo, 'por')
            .then(function (resultado) {
                const texto = resultado && resultado.data ? resultado.data.text : '';
                const lidas = lerTexto(texto);
                const setor = document.getElementById('setor').value || lidas.setor;
                publicar(lidas.linhas, setor, 'Imagem', '');
                if (!lidas.linhas.length) {
                    mostrarStatus('warning', 'A foto não trouxe números legíveis. As enfermarias oficiais estão em branco para completar.');
                }
            })
            .catch(function () {
                publicar([], document.getElementById('setor').value, 'Imagem', '');
                mostrarStatus('warning', 'Não foi possível ler a foto. Complete o documento ao lado da imagem.');
            });
    }

    function publicar(linhas, setor, origem, nome) {
        linhasAtuais = linhas;
        if (setor && window.APP.setores[setor]) setorRevisao.value = setor;
        const meta = document.getElementById('review-meta');
        meta.textContent = origem + (nome ? ' · ' + nome : '') + ' · revise antes de gravar';
        abrirDocumento(setorRevisao.value, dataDaLeitura(linhas), linhas);
    }

    function abrirDocumento(setor, data, linhas) {
        if (!setor) setor = setorRevisao.value;
        Documento.montar(tabelaWrap, { linhas: linhas || [], setor: setor || '', limiar: limiar });
        const campoData = tabelaWrap.querySelector('[data-chave="data"]');
        if (campoData && data && !campoData.value) {
            const partes = data.split('-');
            if (partes.length === 3) campoData.value = partes[2] + '/' + partes[1] + '/' + partes[0];
        }
        confirmar.checked = false;
        resultado.hidden = true;
        review.hidden = false;
        atualizarDestaque();
        mostrarTela('leitura');
        review.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function gravar() {
        const coleta = Documento.coletar(tabelaWrap, setorRevisao.value);
        if (coleta.erros.length) {
            mostrarStatus('danger', coleta.erros.join(' '));
            return;
        }
        if (!confirmacao.hidden && !confirmar.checked) {
            mostrarStatus('warning', 'Confirme a revisão dos campos em amarelo.');
            return;
        }
        const atuais = lerStore();
        const novas = coleta.linhas.map(normalizar);
        const restantes = atuais.filter(function (item) {
            return !novas.some(function (linha) {
                return linha.setor === item.setor && linha.data === item.data && linha.leito === item.leito;
            });
        });
        escreverStore(restantes.concat(novas));
        resultado.hidden = false;
        resultado.className = 'alert alert-success';
        resultado.textContent = novas.length + ' enfermaria(s) gravada(s) neste aparelho.';
        mostrarStatus('success', avisos(novas).join(' ') || 'Documento gravado neste aparelho.');
        renderPainel();
        renderLista();
    }

    function mostrarTela(nome) {
        document.getElementById('tela-leitura').hidden = nome !== 'leitura';
        document.getElementById('tela-documento').hidden = nome !== 'documento';
        document.getElementById('tela-painel').hidden = nome !== 'painel';
        document.querySelectorAll('[data-tela]').forEach(function (link) {
            link.classList.toggle('is-active', link.dataset.tela === nome);
        });
        if (nome !== 'leitura') review.hidden = true;
        if (nome === 'painel') renderPainel();
        if (nome === 'documento') renderLista();
    }

    function renderLista() {
        const alvo = document.getElementById('lista-documentos');
        const grupos = agrupar();
        alvo.replaceChildren();
        const titulo = document.createElement('h2');
        titulo.textContent = 'Conferências deste aparelho';
        alvo.appendChild(titulo);
        if (!grupos.length) {
            const vazio = document.createElement('p');
            vazio.className = 'vazio';
            vazio.textContent = 'Ainda não há documento gravado neste navegador.';
            alvo.appendChild(vazio);
            return;
        }
        grupos.forEach(function (grupo) {
            const botao = document.createElement('button');
            botao.type = 'button';
            botao.className = 'btn btn-outline-primary m-1';
            botao.textContent = (window.APP.setores[grupo.setor] || grupo.setor) + ' · ' + exibir(grupo.data);
            botao.addEventListener('click', function () {
                linhasAtuais = grupo.linhas.map(paraDocumento);
                preview.replaceChildren();
                abrirDocumento(grupo.setor, grupo.data, linhasAtuais);
            });
            alvo.appendChild(botao);
        });
    }

    function renderPainel() {
        const linhas = lerStore();
        const pulseira = soma(linhas, 'com_pulseira');
        const placa = soma(linhas, 'com_placa');
        const metricas = document.getElementById('metricas');
        metricas.replaceChildren();
        [
            ['Registros', String(linhas.length)],
            ['Com pulseira', String(pulseira)],
            ['Placa / pulseira', percentual(placa, pulseira)]
        ].forEach(function (par) {
            const coluna = document.createElement('div');
            coluna.className = 'col-6 col-lg-4';
            coluna.innerHTML = '<article class="metrica"><span></span><strong></strong></article>';
            coluna.querySelector('span').textContent = par[0];
            coluna.querySelector('strong').textContent = par[1];
            metricas.appendChild(coluna);
        });
        const corpo = document.getElementById('painel-corpo');
        corpo.replaceChildren();
        const titulo = document.createElement('h2');
        titulo.textContent = 'Lançamentos';
        corpo.appendChild(titulo);
        if (!linhas.length) {
            const vazio = document.createElement('p');
            vazio.className = 'vazio';
            vazio.textContent = 'Ainda não há dados gravados neste aparelho.';
            corpo.appendChild(vazio);
            return;
        }
        const tabela = document.createElement('table');
        tabela.className = 'table tabela-painel';
        tabela.innerHTML = '<thead><tr><th>Data</th><th>Setor</th><th>Enfermaria</th><th>Pulseira</th><th>Placa</th><th>Flebite</th><th></th></tr></thead>';
        const tbody = document.createElement('tbody');
        linhas.slice().sort(function (a, b) {
            return (b.data + b.leito).localeCompare(a.data + a.leito);
        }).forEach(function (linha) {
            const tr = document.createElement('tr');
            [exibir(linha.data), window.APP.setores[linha.setor] || linha.setor, linha.leito, linha.com_pulseira || '—', linha.com_placa || '—', linha.casos_flebite || '—'].forEach(function (valor) {
                const td = document.createElement('td');
                td.textContent = valor;
                tr.appendChild(td);
            });
            const acao = document.createElement('td');
            const botao = document.createElement('button');
            botao.type = 'button';
            botao.className = 'btn btn-sm btn-outline-primary';
            botao.textContent = 'Abrir';
            botao.addEventListener('click', function () {
                const grupo = agrupar().find(function (item) {
                    return item.setor === linha.setor && item.data === linha.data;
                });
                linhasAtuais = grupo ? grupo.linhas.map(paraDocumento) : [paraDocumento(linha)];
                preview.replaceChildren();
                abrirDocumento(linha.setor, linha.data, linhasAtuais);
            });
            acao.appendChild(botao);
            tr.appendChild(acao);
            tbody.appendChild(tr);
        });
        tabela.appendChild(tbody);
        corpo.appendChild(tabela);
    }

    function baixarCsv() {
        const linhas = lerStore();
        const colunas = ['data', 'setor', 'leito'].concat(window.APP.campos.filter(function (campo) {
            return campo.chave !== 'data' && campo.chave !== 'leito';
        }).map(function (campo) { return campo.chave; }));
        const texto = [colunas.join(';')].concat(linhas.map(function (linha) {
            return colunas.map(function (chave) { return linha[chave] || ''; }).join(';');
        })).join('\n');
        const blob = new Blob([texto], { type: 'text/csv;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'conferencia_visual.csv';
        link.click();
    }

    function atualizarDestaque() {
        const baixas = Documento.destacar(tabelaWrap, limiar);
        confirmacao.hidden = baixas === 0;
        if (baixas === 0) confirmar.checked = false;
        atualizarBotao();
    }

    function atualizarBotao() {
        document.getElementById('btn-gravar').disabled = !confirmacao.hidden && !confirmar.checked;
    }

    function lerStore() {
        try {
            const lista = JSON.parse(localStorage.getItem(CHAVE) || '[]');
            return Array.isArray(lista) ? lista : [];
        } catch (erro) {
            return [];
        }
    }

    function escreverStore(lista) {
        localStorage.setItem(CHAVE, JSON.stringify(lista));
    }

    function agrupar() {
        const mapa = {};
        lerStore().forEach(function (linha) {
            const chave = linha.setor + '|' + linha.data;
            if (!mapa[chave]) mapa[chave] = { setor: linha.setor, data: linha.data, linhas: [] };
            mapa[chave].linhas.push(linha);
        });
        return Object.values(mapa).sort(function (a, b) { return b.data.localeCompare(a.data); });
    }

    function normalizar(linha) {
        const saida = { setor: linha.setor, data: dataIso(linha.data), leito: linha.leito, assinatura: linha.assinatura || '' };
        window.APP.campos.forEach(function (campo) {
            if (campo.chave === 'data' || campo.chave === 'leito') return;
            saida[campo.chave] = linha[campo.chave] || '';
        });
        return saida;
    }

    function paraDocumento(linha) {
        const item = {};
        window.APP.campos.forEach(function (campo) {
            const valor = campo.chave === 'data' ? linha.data : (linha[campo.chave] || '');
            item[campo.chave] = { valor: valor, confianca: 1 };
        });
        return item;
    }

    function soma(linhas, chave) {
        return linhas.reduce(function (total, linha) { return total + (parseInt(linha[chave], 10) || 0); }, 0);
    }

    function percentual(parte, total) {
        if (!total) return '—';
        return (Math.round(parte * 1000 / total) / 10).toFixed(1).replace('.', ',') + '%';
    }

    function avisos(linhas) {
        const lista = [];
        linhas.forEach(function (linha) {
            if (numero(linha.mav_com_identificacao) > numero(linha.total_mav_observados) && linha.total_mav_observados !== '') {
                lista.push(linha.leito + ': MAV com identificação maior que o total.');
            }
            if (numero(linha.casos_flebite) > numero(linha.pacientes_com_avp) && linha.pacientes_com_avp !== '') {
                lista.push(linha.leito + ': flebite maior que os pacientes com AVP.');
            }
        });
        return lista;
    }

    function numero(valor) {
        return /^\d+$/.test(valor || '') ? parseInt(valor, 10) : -1;
    }

    function dataDaLeitura(linhas) {
        const datas = {};
        (linhas || []).forEach(function (linha) {
            const valor = linha.data && linha.data.valor;
            if (valor) datas[valor] = (datas[valor] || 0) + 1;
        });
        const chaves = Object.keys(datas);
        if (!chaves.length) return hoje();
        chaves.sort(function (a, b) { return datas[b] - datas[a]; });
        return chaves[0];
    }

    function hoje() {
        const data = new Date();
        const mes = String(data.getMonth() + 1).padStart(2, '0');
        const dia = String(data.getDate()).padStart(2, '0');
        return data.getFullYear() + '-' + mes + '-' + dia;
    }

    function exibir(iso) {
        const partes = String(iso || '').split('-');
        return partes.length === 3 ? partes[2] + '/' + partes[1] + '/' + partes[0] : iso;
    }

    function dataIso(valor) {
        const texto = String(valor || '').trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto;
        const barra = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto);
        return barra ? barra[3] + '-' + barra[2] + '-' + barra[1] : '';
    }

    function fold(valor) {
        return String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    }

    function setorPorLeito(leito) {
        const texto = String(leito || '').trim();
        const match = texto.match(/\b([4-8]\d{2})\b/) || (/^[4-8]\d{2}$/.test(texto) ? [texto, texto] : null);
        if (match) return match[1].charAt(0) + '_ANDAR';
        const alvo = fold(texto);
        if (!alvo) return '';
        const achados = [];
        Object.entries(window.APP.leitos).forEach(function (par) {
            par[1].forEach(function (item) {
                if (fold(item) === alvo) achados.push(par[0]);
            });
        });
        return new Set(achados).size === 1 ? achados[0] : '';
    }

    function maioria(linhas) {
        const votos = {};
        linhas.forEach(function (linha) {
            const setor = setorPorLeito(linha.leito.valor);
            if (setor) votos[setor] = (votos[setor] || 0) + 1;
        });
        const chaves = Object.keys(votos);
        if (!chaves.length) return '';
        chaves.sort(function (a, b) { return votos[b] - votos[a]; });
        return chaves[0];
    }

    function lerTexto(texto) {
        const linhas = [];
        String(texto || '').split(/\n/).forEach(function (bruta) {
            const partes = bruta.split(/\s+/).filter(Boolean);
            const indice = partes.findIndex(function (parte) { return setorPorLeito(parte); });
            if (indice < 0) return;
            const leito = partes[indice];
            const setor = setorPorLeito(leito);
            const chaves = window.APP.modulos[window.APP.perfis[setor]] || [];
            const item = {
                leito: { valor: leito, confianca: 0.6 },
                data: { valor: indice > 0 ? dataIso(partes[indice - 1]) : '', confianca: 0.6 }
            };
            const numeros = partes.slice(indice + 1).filter(function (parte) { return /^\d+$/.test(parte) || parte === '?'; });
            chaves.forEach(function (chave, posicao) {
                const valor = numeros[posicao] && numeros[posicao] !== '?' ? numeros[posicao] : '';
                item[chave] = { valor: valor, confianca: numeros[posicao] === '?' ? 0.4 : (valor ? 0.6 : 1) };
            });
            linhas.push(item);
        });
        return { linhas: linhas, setor: maioria(linhas) };
    }

    function lerCsv(texto) {
        const bruto = String(texto || '').replace(/^\uFEFF/, '');
        const separador = bruto.indexOf(';') >= 0 ? ';' : ',';
        const matriz = bruto.split(/\r?\n/).filter(function (linha) { return linha.trim() !== ''; }).map(function (linha) {
            return linha.split(separador).map(function (celula) { return celula.trim(); });
        });
        if (!matriz.length) return { linhas: [], setor: '' };
        const mapa = mapearCabecalho(matriz[0]);
        const linhas = [];
        matriz.slice(1).forEach(function (linha) {
            const item = {};
            window.APP.campos.forEach(function (campo) {
                const indice = mapa[campo.chave];
                const valor = indice == null ? '' : (linha[indice] || '');
                const ruim = campo.tipo === 'numero' && valor !== '' && !/^\d+$/.test(valor);
                item[campo.chave] = {
                    valor: campo.chave === 'data' ? dataIso(valor) : (ruim ? '' : valor),
                    confianca: ruim ? 0.4 : 0.98
                };
                if (ruim) item[campo.chave].valor = valor;
            });
            if (item.leito && item.leito.valor && fold(item.leito.valor) !== 'total') linhas.push(item);
        });
        return { linhas: linhas, setor: maioria(linhas) };
    }

    function mapearCabecalho(cabecalhos) {
        const aliases = [];
        window.APP.campos.forEach(function (campo) {
            [campo.rotulo].concat(campo.sinonimos || []).forEach(function (nome) {
                const alias = fold(nome);
                if (alias) aliases.push([alias, campo.chave]);
            });
        });
        aliases.sort(function (a, b) { return b[0].length - a[0].length; });
        const mapa = {};
        cabecalhos.forEach(function (cabecalho, indice) {
            const texto = fold(cabecalho);
            let escolhido = '';
            aliases.some(function (par) {
                if (par[0] === texto || (par[0].length >= 4 && (' ' + texto + ' ').indexOf(' ' + par[0] + ' ') >= 0)) {
                    if (!Object.values(mapa).includes(par[1])) escolhido = par[1];
                    return Boolean(escolhido);
                }
                return false;
            });
            if (escolhido) mapa[escolhido] = indice;
        });
        return mapa;
    }

    function mostrarStatus(tipo, mensagem) {
        statusBox.className = 'alert alert-' + tipo;
        statusBox.textContent = mensagem;
        statusBox.hidden = false;
    }
})();
