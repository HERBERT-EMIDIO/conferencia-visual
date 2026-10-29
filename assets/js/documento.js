(function () {
    function perfil(setor) {
        return (window.APP.perfis && window.APP.perfis[setor]) || 'enfermaria';
    }

    function chavesDoSetor(setor) {
        const modulo = (window.APP.modulos && window.APP.modulos[perfil(setor)]) || [];
        return modulo;
    }

    function definicao(chave) {
        return window.APP.campos.find(function (campo) { return campo.chave === chave; });
    }

    function fold(valor) {
        return String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    }

    function exibirData(valor) {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor || '');
        return match ? match[3] + '/' + match[2] + '/' + match[1] : (valor || '');
    }

    function valorCampo(linha, chave) {
        const info = linha && linha[chave];
        if (!info) return { valor: '', confianca: 1 };
        if (typeof info === 'object') return { valor: info.valor || '', confianca: Number(info.confianca ?? 1) };
        return { valor: String(info), confianca: 1 };
    }

    function casarLeito(lido, oficiais) {
        const direto = oficiais.find(function (item) { return fold(item) === fold(lido); });
        if (direto) return direto;
        const digitos = String(lido || '').replace(/\D/g, '');
        if (digitos) {
            const porNumero = oficiais.find(function (item) { return item === digitos; });
            if (porNumero) return porNumero;
        }
        return lido;
    }

    function preparar(linhas, setor) {
        const oficiais = (window.APP.leitos && window.APP.leitos[setor]) || [];
        const porLeito = {};
        (linhas || []).forEach(function (linha) {
            const bruto = valorCampo(linha, 'leito').valor;
            if (!bruto || fold(bruto) === 'total' || fold(bruto) === 'medias' || bruto === '%') return;
            const nome = casarLeito(bruto, oficiais);
            porLeito[nome] = linha;
        });
        const ordem = oficiais.slice();
        Object.keys(porLeito).forEach(function (nome) {
            if (ordem.indexOf(nome) === -1) ordem.push(nome);
        });
        if (!ordem.length) ordem.push('');
        let data = '';
        let assinatura = '';
        let dataConf = 1;
        let assinaturaConf = 1;
        Object.keys(porLeito).some(function (nome) {
            const infoData = valorCampo(porLeito[nome], 'data');
            const infoAssinatura = valorCampo(porLeito[nome], 'assinatura');
            data = infoData.valor;
            assinatura = infoAssinatura.valor;
            dataConf = infoData.confianca;
            assinaturaConf = infoAssinatura.confianca;
            return data !== '';
        });
        return {
            ordem: ordem,
            porLeito: porLeito,
            data: exibirData(data),
            assinatura: assinatura,
            dataConf: data ? dataConf : 1,
            assinaturaConf: assinatura ? assinaturaConf : 1
        };
    }

    function inputNumero(chave, info, limiar) {
        const campo = document.createElement('input');
        campo.type = 'text';
        campo.inputMode = 'numeric';
        campo.maxLength = 6;
        campo.dataset.chave = chave;
        campo.dataset.original = info.valor || '';
        campo.dataset.originalConf = String(info.confianca);
        campo.dataset.conf = String(info.valor ? info.confianca : 1);
        campo.value = info.valor || '';
        campo.setAttribute('aria-label', definicao(chave).rotulo);
        if (campo.value !== '' && Number(campo.dataset.conf) < limiar) campo.classList.add('baixa');
        campo.addEventListener('input', function () {
            const mudou = campo.value !== campo.dataset.original;
            campo.dataset.conf = mudou ? '1' : (campo.value === '' ? '1' : campo.dataset.originalConf);
            campo.classList.toggle('baixa', campo.value !== '' && Number(campo.dataset.conf) < limiar);
        });
        return campo;
    }

    function montar(alvo, opcoes) {
        const setor = opcoes.setor || '';
        const limiar = Number(opcoes.limiar || 0.75);
        const preparado = preparar(opcoes.linhas, setor);
        const chaves = chavesDoSetor(setor);
        const artigo = document.createElement('article');
        artigo.className = 'documento';
        artigo.id = 'documento';

        const cabeca = document.createElement('header');
        cabeca.className = 'doc-cabeca';
        const kicker = document.createElement('p');
        kicker.className = 'doc-kicker';
        kicker.textContent = 'Indicadores de risco 2026';
        const titulo = document.createElement('h2');
        titulo.textContent = 'Conferência visual';
        const sub = document.createElement('p');
        sub.className = 'doc-setor';
        sub.textContent = (window.APP.setores && window.APP.setores[setor]) || 'Setor a confirmar';
        cabeca.append(kicker, titulo, sub);

        const ficha = document.createElement('div');
        ficha.className = 'doc-ficha';
        ficha.append(rotuloCampo('Data', campoTexto('data', preparado.data, 'dd/mm/aaaa', preparado.dataConf, limiar)));
        ficha.append(rotuloCampo('Assinatura', campoTexto('assinatura', preparado.assinatura, 'Nome de quem conferiu', preparado.assinaturaConf, limiar)));
        cabeca.appendChild(ficha);
        artigo.appendChild(cabeca);

        const nota = document.createElement('p');
        nota.className = 'doc-nota';
        nota.textContent = 'Os campos em branco não foram lidos na foto. Preencha ou corrija antes de gravar. O amarelo pede confirmação.';
        artigo.appendChild(nota);

        preparado.ordem.forEach(function (nome) {
            const origem = preparado.porLeito[nome];
            const card = document.createElement('section');
            card.className = 'doc-leito' + (origem ? '' : ' doc-nao-lido');
            const topo = document.createElement('div');
            topo.className = 'doc-leito-topo';
            const nomeInput = document.createElement('input');
            nomeInput.className = 'doc-leito-nome';
            nomeInput.value = nome;
            nomeInput.maxLength = 40;
            nomeInput.setAttribute('aria-label', 'Enfermaria');
            const estado = document.createElement('span');
            estado.textContent = origem ? 'Lido na foto' : 'Não captado — preencher';
            topo.append(nomeInput, estado);
            card.appendChild(topo);

            window.APP.grupos.forEach(function (grupo) {
                const visiveis = grupo.campos.filter(function (chave) { return chaves.indexOf(chave) !== -1; });
                if (!visiveis.length) return;
                const bloco = document.createElement('div');
                bloco.className = 'doc-meta';
                const legenda = document.createElement('h3');
                legenda.textContent = grupo.titulo;
                bloco.appendChild(legenda);
                const grade = document.createElement('div');
                grade.className = 'doc-campos';
                visiveis.forEach(function (chave) {
                    const info = valorCampo(origem, chave);
                    grade.appendChild(rotuloCampo(definicao(chave).rotulo, inputNumero(chave, info, limiar)));
                });
                bloco.appendChild(grade);
                card.appendChild(bloco);
            });
            artigo.appendChild(card);
        });

        alvo.replaceChildren(artigo);
    }

    function rotuloCampo(texto, controle) {
        const label = document.createElement('label');
        const nome = document.createElement('span');
        nome.textContent = texto;
        label.append(nome, controle);
        return label;
    }

    function campoTexto(chave, valor, placeholder, confianca, limiar) {
        const campo = document.createElement('input');
        campo.type = 'text';
        campo.dataset.chave = chave;
        campo.dataset.original = valor || '';
        campo.dataset.originalConf = String(confianca == null ? 1 : confianca);
        campo.dataset.conf = String(valor ? campo.dataset.originalConf : 1);
        campo.value = valor || '';
        campo.placeholder = placeholder;
        campo.maxLength = chave === 'assinatura' ? 120 : 12;
        if (campo.value !== '' && Number(campo.dataset.conf) < Number(limiar || 0.75)) campo.classList.add('baixa');
        campo.addEventListener('input', function () {
            const mudou = campo.value !== campo.dataset.original;
            campo.dataset.conf = mudou || campo.value === '' ? '1' : campo.dataset.originalConf;
            campo.classList.toggle('baixa', campo.value !== '' && Number(campo.dataset.conf) < Number(limiar || 0.75));
        });
        return campo;
    }

    function adicionar(alvo, setor) {
        if (!alvo.querySelector('.documento')) {
            montar(alvo, { linhas: [], setor: setor, limiar: window.APP.limiar });
        }
        const artigo = alvo.querySelector('.documento');
        const chaves = chavesDoSetor(setor);
        const card = document.createElement('section');
        card.className = 'doc-leito doc-nao-lido';
        const topo = document.createElement('div');
        topo.className = 'doc-leito-topo';
        const nomeInput = document.createElement('input');
        nomeInput.className = 'doc-leito-nome';
        nomeInput.placeholder = 'Enfermaria';
        nomeInput.maxLength = 40;
        const estado = document.createElement('span');
        estado.textContent = 'Incluída manualmente';
        topo.append(nomeInput, estado);
        card.appendChild(topo);
        window.APP.grupos.forEach(function (grupo) {
            const visiveis = grupo.campos.filter(function (chave) { return chaves.indexOf(chave) !== -1; });
            if (!visiveis.length) return;
            const bloco = document.createElement('div');
            bloco.className = 'doc-meta';
            const legenda = document.createElement('h3');
            legenda.textContent = grupo.titulo;
            const grade = document.createElement('div');
            grade.className = 'doc-campos';
            visiveis.forEach(function (chave) {
                grade.appendChild(rotuloCampo(definicao(chave).rotulo, inputNumero(chave, { valor: '', confianca: 1 }, window.APP.limiar)));
            });
            bloco.append(legenda, grade);
            card.appendChild(bloco);
        });
        artigo.appendChild(card);
        nomeInput.focus();
    }

    function coletar(alvo, setor) {
        const artigo = alvo.querySelector('.documento');
        const erros = [];
        const linhas = [];
        if (!artigo) return { erros: ['O documento ainda não foi montado.'], linhas: [] };
        const campoData = artigo.querySelector('header [data-chave="data"]');
        const campoAssinatura = artigo.querySelector('header [data-chave="assinatura"]');
        const data = campoData ? campoData.value : '';
        const assinatura = campoAssinatura ? campoAssinatura.value : '';
        const dataLimpa = String(data).trim();
        if (!setor) erros.push('Selecione o setor.');
        if (!/^(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})$/.test(dataLimpa)) {
            erros.push('Informe a data no formato dd/mm/aaaa.');
        }
        artigo.querySelectorAll('.doc-leito').forEach(function (card) {
            const leito = card.querySelector('.doc-leito-nome').value.trim();
            const linha = {
                setor: setor,
                data: dataLimpa,
                leito: leito,
                assinatura: String(assinatura).trim(),
                confiancas: {
                    data: Number(campoData ? campoData.dataset.conf : 1),
                    leito: 1,
                    assinatura: Number(campoAssinatura ? campoAssinatura.dataset.conf : 1)
                }
            };
            let temNumero = false;
            card.querySelectorAll('input[data-chave]').forEach(function (campo) {
                linha[campo.dataset.chave] = campo.value.trim();
                linha.confiancas[campo.dataset.chave] = Number(campo.dataset.conf || 1);
                if (campo.value.trim() !== '') temNumero = true;
            });
            if (!temNumero) return;
            if (!leito) erros.push('Há uma enfermaria sem nome.');
            window.APP.campos.forEach(function (campo) {
                if (campo.tipo !== 'numero' || !linha[campo.chave]) return;
                if (!/^\d+$/.test(linha[campo.chave])) {
                    erros.push(leito + ', ' + campo.rotulo + ': informe um número inteiro zero ou maior.');
                }
            });
            linhas.push(linha);
        });
        if (!linhas.length && !erros.length) erros.push('Preencha ao menos uma enfermaria.');
        return { erros: erros, linhas: linhas };
    }

    function destacar(alvo, limiar) {
        let baixas = 0;
        alvo.querySelectorAll('.documento input[data-conf]').forEach(function (campo) {
            const baixa = campo.value !== '' && Number(campo.dataset.conf) < limiar;
            campo.classList.toggle('baixa', baixa);
            if (baixa) baixas += 1;
        });
        return baixas;
    }

    window.Documento = { montar: montar, coletar: coletar, destacar: destacar, adicionar: adicionar };
})();
