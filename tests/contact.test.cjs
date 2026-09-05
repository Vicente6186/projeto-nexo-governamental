const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { runInNewContext } = require('node:vm');

const source = readFileSync(resolve(__dirname, '../src/js/index.js'), 'utf8')
    .replace("import '../css/index.css';", '');

function setup({ contentHeight = 148, maxHeight = '240px', fields = {} } = {}) {
    const inputEvents = {};
    const windowEvents = {};
    const formEvents = {};
    const textarea = {
        dataset: { maxHeight: '240' },
        style: {},
        scrollHeight: contentHeight,
        addEventListener: (type, callback) => { inputEvents[type] = callback; },
    };
    const form = {
        dataset: { recipient: 'nexogov.usp@gmail.com' },
        addEventListener: (type, callback) => { formEvents[type] = callback; },
    };
    const window = {
        location: { href: '' },
        getComputedStyle: () => ({ maxHeight, borderTopWidth: '1px', borderBottomWidth: '1px' }),
        addEventListener: (type, callback) => { windowEvents[type] = callback; },
    };
    runInNewContext(source, {
        document: {
            querySelectorAll: () => [textarea],
            querySelector: () => form,
        },
        window,
        FormData: class { get(name) { return fields[name] ?? null; } },
    });
    return { textarea, inputEvents, windowEvents, formEvents, window };
}

test('textarea inclui as bordas e acompanha o reflow sem ocultar linhas', () => {
    const { textarea, windowEvents } = setup();
    assert.equal(textarea.style.height, '150px');
    textarea.scrollHeight = 172;
    windowEvents.resize();
    assert.equal(textarea.style.height, '174px');
    assert.notEqual(textarea.style.overflowY, 'hidden');
});

test('textarea respeita o limite em rem com texto ampliado e encolhe após apagar', () => {
    const { textarea, inputEvents } = setup({ contentHeight: 700, maxHeight: '480px' });
    assert.equal(textarea.style.height, '480px');
    textarea.scrollHeight = 298;
    inputEvents.input();
    assert.equal(textarea.style.height, '300px');
});

test('contato preserva destinatário, caracteres especiais e linhas sem enviar e-mail', () => {
    const fields = {
        name: '  João & Maria  ',
        email: 'joao+teste@example.com',
        college: 'Faculdade São Francisco',
        description: 'Dúvida sobre extensão?\nDetalhes: 100% & participação #1.',
    };
    const { formEvents, window } = setup({ fields });
    let prevented = false;
    formEvents.submit({ preventDefault() { prevented = true; } });
    const url = new URL(window.location.href);
    assert.equal(prevented, true);
    assert.equal(decodeURIComponent(url.pathname), 'nexogov.usp@gmail.com');
    assert.equal(url.searchParams.get('subject'), 'Contato pelo site - João & Maria');
    assert.equal(url.searchParams.get('body'), [
        'Nova mensagem enviada pelo site Nexo Governamental.', '',
        'Nome: João & Maria', 'E-mail: joao+teste@example.com',
        'Faculdade: Faculdade São Francisco', '', 'Mensagem:', fields.description,
    ].join('\n'));
});
