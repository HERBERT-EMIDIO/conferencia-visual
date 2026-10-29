(function () {
    if (!window.APP || !window.APP.setor || !window.Documento) return;

    const alvo = document.getElementById('tabela-wrap');
    const statusBox = document.getElementById('status');
    const confirmacao = document.getElementById('confirmacao');
    const confirmar = document.getElementById('confirmar');
    const resultado = document.getElementById('resultado');
    const limiar = Number(window.APP.limiar || 0.75);

    Documento.montar(alvo, {
        linhas: window.APP.linhas || [],
        setor: window.APP.setor,
        limiar: limiar
    });
    const campoData = alvo.querySelector('[data-chave="data"]');
    if (campoData && campoData.value === '' && window.APP.data) {
        const partes = String(window.APP.data).split('-');
        if (partes.length === 3) campoData.value = partes[2] + '/' + partes[1] + '/' + partes[0];
    }
    destacar();

    document.getElementById('btn-linha').addEventListener('click', function () {
        Documento.adicionar(alvo, window.APP.setor);
        destacar();
    });
    document.getElementById('btn-imprimir').addEventListener('click', function () {
        window.print();
    });
    document.getElementById('btn-gravar').addEventListener('click', gravar);
    confirmar.addEventListener('change', atualizarBotao);
    alvo.addEventListener('input', destacar);

    function destacar() {
        const baixas = Documento.destacar(alvo, limiar);
        confirmacao.hidden = baixas === 0;
        if (baixas === 0) confirmar.checked = false;
        atualizarBotao();
    }

    function atualizarBotao() {
        document.getElementById('btn-gravar').disabled = !confirmacao.hidden && !confirmar.checked;
    }

    function gravar() {
        const coleta = Documento.coletar(alvo, window.APP.setor);
        if (coleta.erros.length) {
            mostrar('danger', coleta.erros.join(' '));
            return;
        }
        if (!confirmacao.hidden && !confirmar.checked) {
            mostrar('warning', 'Confirme a revisão dos campos em amarelo.');
            return;
        }
        const botao = document.getElementById('btn-gravar');
        botao.disabled = true;
        fetch('process.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                confirmar_baixa_confianca: confirmar.checked,
                linhas: coleta.linhas
            })
        })
            .then(function (resposta) { return resposta.json(); })
            .then(function (resposta) {
                if (!resposta.ok) {
                    mostrar('danger', (resposta.erros && resposta.erros.join(' ')) || resposta.erro || 'Não foi possível gravar.');
                    return;
                }
                resultado.hidden = false;
                resultado.className = 'alert alert-success';
                resultado.textContent = resposta.gravados + ' enfermaria(s) gravada(s) no documento.';
                mostrar('success', 'Documento atualizado.');
            })
            .catch(function () {
                mostrar('danger', 'Não foi possível gravar.');
            })
            .finally(atualizarBotao);
    }

    function mostrar(tipo, mensagem) {
        statusBox.className = 'alert alert-' + tipo + ' no-print';
        statusBox.textContent = mensagem;
        statusBox.hidden = false;
    }
})();
