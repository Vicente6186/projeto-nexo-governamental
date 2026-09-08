# Nexo Governamental · site e painel editorial

Site institucional e blog do Nexo Governamental XI de Agosto, organização estudantil da Faculdade de Direito da USP, com painel em **React + Tailwind CSS**, API em **Node.js 24 + Fastify** e persistência em **SQLite**. A equipe mantém o processo seletivo, os canais de contato e os artigos em `/admin`.

## Rodar no computador

Requisito: Node.js 24 ou superior, com npm.

```sh
npm ci
cp .env.example .env
```

No arquivo `.env`, configure `ADMIN_EMAIL` e uma `ADMIN_PASSWORD` exclusiva com pelo menos 12 caracteres. Mantenha `CMS_LOCAL_PREVIEW=0`. Depois execute:

```sh
npm run dev
```

- Site: <http://127.0.0.1:8080/>
- Blog: <http://127.0.0.1:8080/blog/>
- Painel: <http://127.0.0.1:8080/admin/>
- API: <http://127.0.0.1:3001/>

O Webpack atende a interface na porta 8080 e encaminha API, blog, uploads e variantes de imagens para o Fastify na porta 3001. Para conferir o SEO completo localmente, use o Fastify na porta 3001: os arquivos estáticos do Webpack podem ter precedência sobre robots e sitemaps na porta 8080. Os dois processos iniciam juntos. Entre no painel com o e-mail e a senha configurados. O acesso de demonstração está desabilitado; a pré-visualização editorial dos rascunhos permanece disponível após entrar.

## Painel essencial

O painel tem quatro áreas: **Visão geral**, **Processo seletivo**, **Blog do Nexo** e **Contato**. A visão geral reúne os atalhos e o estado das alterações. A edição do site se concentra no que a equipe precisa atualizar com frequência:

- **Processo seletivo:** edição, situação das inscrições, abertura e encerramento, link do formulário, edital por link ou envio de PDF e etapas do cronograma com nome, data e orientações.
- **Contato:** e-mail, endereço do perfil e nome de usuário do Instagram.
- **Blog do Nexo:** criação e edição completa dos artigos, categorias, capas, rascunhos, prévia e publicação.

Em **Blog → Gerenciar categorias**, a equipe pode criar, renomear e excluir categorias. O mesmo atalho fica junto à categoria no editor. A exclusão de uma categoria em uso exige escolher outra para receber os artigos, incluindo rascunhos e arquivados; pelo menos uma categoria deve permanecer. Renomear ou transferir categorias também atualiza os artigos publicados, preservando as demais alterações em rascunho. As categorias ficam no banco de dados e entram no backup. Ao restaurar uma revisão cuja categoria foi removida, a categoria atual do artigo é mantida.

Os títulos e textos institucionais, as imagens principais, os projetos, a visibilidade das seções e a estrutura da página ficam fixos. Esses campos também são protegidos pela API; não podem ser alterados por uma requisição direta ao antigo editor. Os conteúdos e arquivos existentes são preservados. A fonte dos textos institucionais é `shared/content.cjs`; quando ela muda, a atualização explícita descrita em **Conteúdo institucional fixo** sincroniza o banco sem substituir o processo seletivo, os contatos ou os artigos. Alterações de apresentação continuam no código do site.

Para atualizar o processo seletivo ou os contatos:

1. No processo seletivo, avance por **Inscrições**, **Documentos** e **Cronograma**. Em Contato, preencha o e-mail e o perfil do Instagram em uma única tela.
2. Salve o rascunho e confira **Pré-visualizar**.
3. Use **Publicar alterações** e confirme para atualizar o site deste ambiente.

O rascunho é separado do conteúdo publicado. O site consulta apenas a versão publicada. O modelo inicial preserva os conteúdos existentes e mantém as inscrições encerradas até a equipe revisar e publicar uma nova edição. Publicar com a situação “Inscrições abertas” exige um link de inscrição válido. Quando houver datas, o site mostra “Em breve” antes da abertura, libera o botão dentro do período e encerra as inscrições depois do prazo, seguindo o horário de Brasília. A situação “Em breve” escolhida manualmente permanece assim até uma nova publicação.

As etapas cadastradas substituem a imagem antiga do cronograma quando são publicadas. Se todas as etapas forem removidas depois, o site deixa de exibir o cronograma; a imagem antiga não volta automaticamente.

Os botões **Continuar** e **Voltar** apenas navegam entre as etapas; os dados preenchidos e o salvamento de rascunhos são preservados. Campos opcionais ficam recolhidos, e erros direcionam à etapa e ao campo que precisam de correção. Em **Meu acesso**, a alteração de senha aparece somente ao abrir essa opção. O cadastro de integrante segue duas etapas: **Pessoa** e **Permissões e senha**; o acesso só é criado na confirmação final.

O edital pode ser enviado diretamente na página do processo seletivo. A biblioteca de capas fica dentro do editor do blog, sem uma área separada de gerenciamento do site. Os uploads aceitam imagens PNG, JPEG, WebP e AVIF, além de PDFs, com limite de 8 MB por arquivo. As imagens são decodificadas e verificadas antes de salvar; imagens corrompidas ou animadas, maiores que 40 megapixels ou com dimensão acima de 16.000 pixels são recusadas. A versão pública é convertida para WebP com dimensão máxima de 2.400 pixels; o original permanece privado em `originals/`. Os arquivos enviados recebem uma URL pública; envie apenas materiais destinados ao site. O registro interno das alterações permanece no banco, sem oferecer restauração de versões do site no painel simplificado.

O painel destaca a publicação concluída com uma tela verde em tela cheia, exibida somente depois da confirmação do servidor. Ela permite abrir a publicação, copiar o link e continuar no painel, sem tempo de espera obrigatório. Na prévia local, o texto e o link identificam esse ambiente. Salvar rascunhos continua sendo uma ação discreta, sem interromper a escrita.

No blog, **Modo foco** amplia o espaço de escrita; a barra de formatação acompanha textos longos e **Opções do editor** reúne o acesso ao Markdown. A capa pode ser arrastada para a área de envio ou escolhida na biblioteca, com confirmação em **Aplicar capa**. Os indicadores das etapas refletem as pendências atuais; dispensar a capa opcional também permite concluir essa etapa. A revisão final pode expandir os detalhes, e o histórico apresenta o texto formatado.

No processo seletivo, é possível recolher etapas do cronograma e concluir com **Revisar publicação**, preservando a confirmação antes de atualizar o site. O atalho **Equipe**, visível para administradores, oferece busca por nome ou e-mail e filtros de perfil e situação. As animações respeitam a preferência de movimento reduzido do dispositivo.

O menu de aparência, no topo do painel e na tela de acesso, oferece os temas Claro, Escuro e Sistema. O tema Escuro é o padrão para novos acessos; as escolhas salvas de Claro ou Sistema são respeitadas. A escolha fica salva neste navegador e acompanha as outras abas abertas. O modo Sistema segue a preferência do dispositivo. Essa escolha altera apenas o painel; o site público mantém a própria identidade visual. A busca do painel também pode ser aberta com `⌘ K` ou `Ctrl K`.

## Blog

Abra **Blog do Nexo** no painel para criar artigos, acompanhar rascunhos e gerenciar publicações. Cada artigo tem título, endereço, resumo, categoria, autoria, descrição da autoria, imagem de capa com descrição e crédito, palavras-chave e opção de destaque.

1. Crie um artigo. Em **Informações**, preencha título, resumo, categoria e autoria. Em **Texto**, escreva no editor visual, com títulos, listas, citações e links. O modo Markdown continua disponível nas opções avançadas e preserva conteúdos que o editor visual não suporta. Trocar de etapa mantém o texto e o histórico de Desfazer.
2. Em **Capa**, escolha uma imagem e descreva seu conteúdo, ou continue sem imagem. **Salvar rascunho** e **Prévia** ficam disponíveis em todas as etapas. A prévia salva as alterações antes de abrir a visualização privada, com opções de computador e celular. Visitantes continuam vendo somente o que foi publicado.
3. Em **Revisão**, confira o resumo da publicação e as pendências. Os ajustes de destaque, palavras-chave e endereço ficam recolhidos. Revise texto, fontes, autoria e créditos na prévia e confirme a publicação. Artigos publicados aparecem em `/blog/` e têm uma página própria em `/blog/endereco-do-artigo`.
4. Para atualizar um artigo publicado, edite e salve o rascunho, confira a prévia e publique novamente. A versão pública anterior permanece disponível até essa confirmação.
5. Retire uma publicação do ar quando necessário. Arquivar organiza os artigos fora da lista ativa; restaurar devolve o artigo como rascunho, sem republicá-lo automaticamente.

O blog público tem busca, filtro por categoria e paginação. O servidor entrega o conteúdo completo das páginas, incluindo título, descrição e endereço canônico, sem depender de JavaScript para a leitura. O Markdown não executa HTML e restringe os protocolos de links; a prévia exige uma sessão administrativa. No editor, `⌘ S` ou `Ctrl S` salva o rascunho. O painel salva rascunhos automaticamente após a edição válida e mantém uma cópia de recuperação neste navegador, quando o armazenamento local está disponível. Publicar sempre exige revisão e confirmação. O histórico do artigo permite recuperar versões anteriores sem alterar a publicação no ar; mudanças simultâneas e recuperação de cópias antigas exigem revisão.

Os bancos usados anteriormente para avaliação podem conter **rascunhos demonstrativos**, identificados no próprio texto. Eles permanecem sem publicação e devem ser revisados pela equipe antes de qualquer uso institucional. O acesso de demonstração fica desabilitado com `CMS_LOCAL_PREVIEW=0`; isso preserva os rascunhos existentes e a prévia editorial autenticada. Em produção não são criados artigos de exemplo. Publicar no ambiente local altera apenas esse ambiente; não envia conteúdo para uma hospedagem externa.

## SEO dos artigos

O blog entrega HTML completo pelo Fastify. Cada publicação recebe título, descrição, URL canônica, metadados de compartilhamento, dados estruturados `BlogPosting` e navegação `BreadcrumbList`. Autoria, categoria, datas, imagem e créditos vêm da versão publicada; salvar uma edição privada não altera os dados que o Google recebe. A entidade editora é o Nexo Governamental XI de Agosto, sem atribuir a publicação à USP.

`/robots.txt` aponta para `/sitemap.xml`, que reúne a página institucional e o sitemap dinâmico do blog. Publicações e categorias com artigos entram automaticamente; despublicar ou arquivar retira os endereços. Buscas internas, categorias vazias, prévias e erros ficam fora do índice. Endereços inexistentes e páginas além da última retornam 404; a paginação tem URLs canônicas próprias. Prévias continuam protegidas por autenticação.

Capas locais recebem dimensões reais e alternativas WebP de 480, 768, 1.200 e 1.920 px, conforme o tamanho original. O navegador escolhe a largura adequada. A imagem principal recebe prioridade de carregamento, enquanto os cartões usam carregamento adiado. As variantes têm cache e processamento limitado; o original e os backups são preservados. Capas externas continuam na origem escolhida e não são baixadas pelo servidor.

Pelo checkout local com `npm ci` executado (o verificador usa as dependências de desenvolvimento), confira o endereço publicado sem escrever dados:

```sh
npm run check:seo -- --url https://nexo-governamental.netlify.app
# Para conferir o Fastify com a origem padrão do desenvolvimento:
npm run check:seo -- --url http://127.0.0.1:3001 --canonical http://127.0.0.1:8080
```

O comando confere descoberta, canonical, autenticação das prévias e até dez artigos presentes no sitemap. Quando não há publicações, informa essa limitação. Os testes automatizados também verificam artigos em banco isolado, sem publicar exemplos no site.

### Rotina editorial e acompanhamento

1. Produza artigos originais que respondam a uma questão concreta do público. Use um título descritivo, resumo fiel, subtítulos claros e links para fontes primárias. Identifique o autor e sua experiência real; não preencha títulos acadêmicos ou vínculos não confirmados.
2. Escolha uma capa relevante, descreva a imagem e registre os créditos. Inclua links para outras publicações relacionadas quando ajudarem a leitura. Revise dados, datas e referências antes de publicar; atualize quando o conteúdo mudar, sem renovar datas artificialmente.
3. No Google Search Console, use a propriedade de prefixo `https://nexo-governamental.netlify.app/` e envie `sitemap.xml`. O arquivo de verificação Google já presente no projeto é preservado, mas sua presença não comprova que a conta atual controla a propriedade. Depois da primeira publicação, inspecione a URL e acompanhe indexação, consultas e desempenho.
4. Valide uma publicação real no teste de resultados avançados do Google. Dados estruturados válidos permitem elegibilidade; não garantem exibição especial nem posição. Melhorias técnicas também não garantem o topo: conteúdo útil, relevância para a busca e reconhecimento editorial precisam ser construídos pela equipe.

Referências: [dados estruturados de artigos](https://developers.google.com/search/docs/appearance/structured-data/article), [sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap), [imagens](https://developers.google.com/search/docs/appearance/google-images) e [conteúdo útil e confiável](https://developers.google.com/search/docs/fundamentals/creating-helpful-content).

## Recuperação de senha

A recuperação fica na tela de acesso e envia um link por e-mail para uma conta ativa. O link vale por 30 minutos e funciona uma única vez. Após salvar a nova senha, a pessoa entra novamente; as sessões anteriores e os outros links de recuperação da conta deixam de funcionar. A aplicação também tenta enviar um aviso de senha alterada, dentro da mesma cota de envio. A indisponibilidade desse aviso não impede a troca de senha já concluída.

O envio usa a API do Resend, com `RESEND_API_KEY`, `RESEND_FROM` e a origem do painel em `CMS_ORIGIN`. As variáveis de envio ficam vazias nos exemplos: enquanto a configuração estiver ausente ou incompleta, a API indica indisponibilidade e a solicitação retorna HTTP 503, sem afirmar que enviou uma mensagem. A prévia editorial e o login com senha continuam funcionando.

Uma solicitação aceita retorna uma mensagem genérica para proteger a existência das contas. Ela não comprova que o destinatário existe nem que o e-mail chegou. O envio acontece em segundo plano; falhas do provedor são registradas de forma segura e precisam ser acompanhadas pelo responsável.

Para habilitar o envio:

1. Use o plano gratuito do Resend e acompanhe os limites da conta. A integração não compra serviços, ativa upgrades ou altera cobrança. Consulte os [planos atuais do Resend](https://resend.com/pricing).
2. Verifique um domínio ou subdomínio sobre o qual a equipe tenha controle de DNS e escolha um remetente desse domínio. Um endereço pessoal de Gmail não serve como domínio de envio próprio. Siga a [configuração de domínios do Resend](https://resend.com/docs/dashboard/domains/introduction).
3. Crie uma chave dedicada de envio, de preferência restrita ao domínio escolhido, e salve-a somente no ambiente do servidor. Veja as [permissões das chaves do Resend](https://resend.com/docs/dashboard/api-keys/introduction).
4. Mantenha o rastreamento de cliques e de abertura desativado no domínio de envio. Isso evita reescrever o link de recuperação e adicionar rastreamento a uma mensagem sensível; a documentação recomenda essa configuração para fluxos de autenticação. Consulte as [orientações de entrega](https://resend.com/docs/dashboard/emails/deliverability-insights).
5. Preencha `RESEND_FROM` no formato `Nexo Governamental <endereco@dominio-verificado>` e confira `CMS_ORIGIN`: em produção, ela deve apontar para o domínio HTTPS público do painel. Reinicie a aplicação para aplicar as variáveis.
6. Solicite a recuperação de uma conta de teste autorizada, confirme o recebimento e conclua a troca. Confira que o link não pode ser reutilizado e que a sessão antiga foi encerrada. O teste de entrega real exige remetente verificado e a conta Resend configurada.

Há limites de solicitação e de envio. `RESET_EMAIL_DAILY_LIMIT` restringe esta instalação a 20 mensagens por dia UTC por padrão, somando os links de recuperação e os avisos de senha alterada, com valores permitidos de 1 a 90. Esse limite não aumenta o plano do Resend nem cobre envios de outros projetos na mesma conta. Os testes automatizados usam transporte simulado e não enviam e-mails reais.

## Estrutura

| Caminho                                 | Responsabilidade                                    |
| --------------------------------------- | --------------------------------------------------- |
| `src/index.html`, `src/css/`, `src/js/` | Site público e integração com o conteúdo publicado  |
| `src/admin/`                            | Painel em React e Tailwind                          |
| `src/blog/`, `server/blog-pages.cjs`    | Estilos, leitura e páginas públicas do blog         |
| `shared/content.cjs`                    | Conteúdo inicial e campos editoriais compartilhados |
| `shared/blog.cjs`                       | Modelo inicial, validação e Markdown do blog    |
| `server/blog-categories.cjs`            | Categorias persistentes e transferência de artigos  |
| `server/`                               | API Fastify, autenticação, validação e persistência |
| `data/`                                 | Banco SQLite e imagens enviadas; não versionar      |
| `dist/`                                 | Saída do build, servida pelo Fastify em produção    |

## Build e verificações

```sh
npm test
npm run build
npm run test:e2e
```

Os testes de navegador usam Playwright. Se o Chromium ainda não estiver instalado, execute `npx playwright install chromium`. Execute `npm run build` antes dos testes: o Playwright inicia o Fastify na porta 3101 para servir o site e o painel compilados, com um banco temporário separado. Essa instância não reutiliza nem altera a aplicação de desenvolvimento das portas 8080 e 3001. Os testes automatizados e o build verificam a implementação local; a configuração de uma hospedagem real é uma etapa separada.

## Uso pela equipe

O painel usa o Fastify no Railway, com volume persistente. O serviço Railway usa o Dockerfile e o healthcheck configurados diretamente no provedor; `netlify.toml` encaminha todas as rotas ao serviço Node, preservando `https://nexo-governamental.netlify.app` como origem do site, painel e artigos. O Netlify sozinho não executa esta API. Consulte `GO_LIVE_STATUS.md` para a evidência do último deploy e as pendências operacionais.

Prepare o `.env` do ambiente de destino:

| Variável                    | Configuração                                                               |
| --------------------------- | -------------------------------------------------------------------------- |
| `NODE_ENV`                  | `production`                                                               |
| `HOST`                      | `0.0.0.0` em contêiner; `127.0.0.1` se o proxy estiver no mesmo servidor   |
| `PORT`                      | `3001`, por padrão                                                         |
| `DATA_DIR`                  | Caminho do armazenamento persistente; padrão `./data`                      |
| `CMS_ORIGIN`                | Origem HTTPS exata do site, sem barra final, incluindo a porta caso exista |
| `ADMIN_NAME`                | Nome exibido no painel; padrão `Equipe Nexo`                               |
| `ADMIN_EMAIL`               | E-mail do administrador inicial                                            |
| `ADMIN_PASSWORD`            | Senha exclusiva e forte, com no mínimo 12 caracteres                       |
| `RESEND_API_KEY`            | Chave privada de envio do Resend, restrita ao domínio da equipe            |
| `RESEND_FROM`               | Nome e endereço de remetente no domínio verificado                         |
| `RESET_EMAIL_DAILY_LIMIT`   | Limite de recuperação por dia UTC: padrão `20`, entre `1` e `90`           |
| `CMS_LOCAL_PREVIEW`         | `0`                                                                        |
| `CMS_TRUST_PROXY`           | Lista de IPs/CIDRs específicos do proxy reverso; vazio para acesso direto  |
| `CMS_BACKUP_DIR`            | Destino privado dos backups; padrão `DATA_DIR/backups`                     |
| `CMS_BACKUP_INTERVAL_HOURS` | Intervalo em produção: `24` por padrão, de `1` a `168`; `0` desativa       |
| `CMS_BACKUP_KEEP`           | Quantidade de backups retidos; padrão `14`                                 |

As variáveis `ADMIN_EMAIL`, `ADMIN_PASSWORD` e `ADMIN_NAME` configuram o administrador inicial. As contas adicionais são individuais, com papéis de administrador ou editor, e ficam no banco com senha protegida por scrypt. O administrador gerencia os acessos; desativar uma conta revoga suas sessões. Cada integrante deve usar seu próprio acesso.

Alterar as credenciais iniciais no ambiente e reiniciar sincroniza apenas a conta inicial e invalida suas sessões. Uma senha trocada pelo próprio usuário continua válida após reiniciar enquanto as variáveis iniciais permanecerem iguais. A aplicação recusa iniciar em produção sem credenciais e origem HTTPS, ou com a prévia local habilitada.

Configure `CMS_TRUST_PROXY` somente com os IPs/CIDRs exatos do proxy usado pelo provedor. Deixe vazio para acesso direto; não use confiança irrestrita. Isso permite aplicar limites de tentativa de acesso ao endereço correto. Confira essa configuração na hospedagem real antes de liberar o painel.

O modo de produção serve o site, o painel, a API e os uploads na mesma origem:

```sh
npm run build
NODE_ENV=production npm start
```

Consulte `.env.example` para desenvolvimento e `deploy/production.env.example` para produção. Variáveis já definidas no ambiente têm precedência sobre o arquivo `.env`. O comando `npm start` não muda o modo por conta própria: use `NODE_ENV=production npm start` com a origem HTTPS e as credenciais corretas. Não adicione arquivos de ambiente preenchidos, senhas, bancos ou uploads ao Git.

### Configuração do Railway

O serviço existente tem um volume em `/app/data`, dados em `/app/data/nexo`, uma instância, `RAILWAY_DOCKERFILE_PATH=Dockerfile` e `RAILWAY_RUN_UID=0`. O ponto de entrada ajusta a propriedade do volume e reduz o processo da aplicação para UID/GID 1000 antes de abrir o banco. No provedor, configure healthcheck `/api/health`, timeout de 120 segundos e reinício `ON_FAILURE` com até cinco tentativas. As credenciais ficam nas variáveis privadas do serviço.

Não dependa de `railway.toml` em um serviço novo: a configuração legada não é aplicada a novos serviços. Os parâmetros desta instalação foram aplicados diretamente e conferidos pela API do Railway. Consulte a [documentação atual de configuração](https://docs.railway.com/infrastructure-as-code) antes de automatizar infraestrutura adicional.

Para publicar código neste projeto existente, após build, testes e backup:

```sh
railway up --project 8e16e118-4df9-4a36-90ec-4c1f028fe8e6 --service e58610d1-209f-4a88-934a-4d2b48470c35 --environment 7cf6409e-1d76-40eb-b468-e53d0524735c --detach --json
```

Acompanhe até `SUCCESS` e repita as verificações pelo domínio Netlify. O upload da CLI não configura publicação automática por GitHub. Preserve o volume e nunca use uma pasta temporária como `DATA_DIR` da aplicação pública.

### Docker

O `Dockerfile` usa Node.js 24, gera os arquivos de interface em uma etapa separada e executa a aplicação com usuário sem privilégios administrativos. O diretório `/app/data` é o volume persistente, incluindo banco, mídia original e backups; a porta do contêiner é `3001`. O healthcheck consulta `/api/health` sem autenticação.

```sh
docker build -t nexo-governamental .
docker volume create nexo-data
docker run --rm --name nexo \
  --env-file .env \
  -e NODE_ENV=production \
  -e HOST=0.0.0.0 \
  -e PORT=3001 \
  -e DATA_DIR=/app/data \
  -e CMS_LOCAL_PREVIEW=0 \
  -p 127.0.0.1:3001:3001 \
  -v nexo-data:/app/data \
  nexo-governamental
```

Use um `.env` preparado para produção. Configure o domínio HTTPS e o encaminhamento da porta no ambiente de hospedagem. O exemplo expõe a porta somente no computador local.

### Implantação preparada com Docker Compose

O arquivo `compose.production.yml` prepara uma única aplicação Node, com volume nomeado persistente, reinício automático e logs com limite de tamanho. Ele fixa `NODE_ENV=production` e `CMS_LOCAL_PREVIEW=0`, mesmo se um arquivo de ambiente contiver outros valores. A porta do serviço fica restrita a `127.0.0.1` no servidor; o domínio público deve ser atendido por um proxy reverso com HTTPS.

Prepare os arquivos no servidor escolhido:

```sh
cp deploy/production.env.example .env.production
chmod 600 .env.production
```

Preencha `CMS_ORIGIN` com a origem HTTPS exata, `ADMIN_PASSWORD` com uma senha exclusiva, `CMS_TRUST_PROXY` com o IP/CIDR real do proxy e as configurações de envio do Resend descritas em **Recuperação de senha**. O modelo já identifica o administrador inicial; confira os demais valores. `.env.production` é ignorado pelo Git e pelo contexto de build. Não inclua segredos no arquivo de exemplo. Não há domínio, senha ou provedor contratado pelo Compose.

Valide a configuração sem imprimir os segredos:

```sh
docker compose --env-file .env.production -f compose.production.yml config --quiet
```

Depois de preparar o destino e seu proxy, a ativação explícita é:

```sh
docker compose --env-file .env.production -f compose.production.yml up -d --build
```

O volume `nexo-data` recebe banco, uploads, originais e backups; trocar o contêiner preserva esses dados. `NEXO_HTTP_PORT` muda apenas a porta local do servidor. Configure o proxy para encaminhar o domínio HTTPS a essa porta e confirme o endereço de origem que chega ao Fastify antes de definir os proxies confiáveis. Não use curingas. O Compose não instala certificado nem altera DNS.

Para repetir a verificação com as variáveis e o build do contêiner:

```sh
docker compose --env-file .env.production -f compose.production.yml exec nexo npm run check:readiness -- --production
```

Esse comando verifica o domínio de `CMS_ORIGIN`, inclusive a ausência de acesso demonstrativo na resposta real de sessão. Ainda é necessário confirmar o volume após um reinício, a cópia de backup fora do servidor, a recuperação e os acessos da equipe. Não execute `down --volumes` durante atualizações: essa opção remove os dados persistentes.

### Persistência e backup

Mantenha `DATA_DIR` em um volume persistente. Ele contém `nexo.sqlite`, `uploads/`, `originals/` e, por padrão, `backups/`. Os originais e os backups são privados; apenas `uploads/` é servido na web. Não publique esse diretório como uma pasta estática e não o inclua no Git.

O processo de produção faz a primeira cópia após 60 segundos e depois a cada 24 horas. Cada execução cria um snapshot consistente do SQLite, copia uploads e originais e verifica o banco e o SHA-256 de cada arquivo. O diretório final só aparece depois da verificação. O padrão retém as 14 cópias mais recentes; a limpeza atua apenas em diretórios reconhecidos como backups criados pelo próprio Nexo. Falhas são registradas nos logs. Em desenvolvimento, o agendamento fica desligado.

Também é possível criar uma cópia com a aplicação em execução:

```sh
npm run backup
# Destino e retenção explícitos:
npm run backup -- --data-dir ./data --output-root ./data/backups --keep 14
```

O resultado informa o diretório, a data, a quantidade de arquivos e os bytes copiados, sem imprimir credenciais. Um arquivo `.nexo-backup.lock` impede duas cópias simultâneas no mesmo destino. Se um encerramento abrupto deixar esse arquivo, confira que não há backup em execução antes de removê-lo e repetir o comando.

Os backups no mesmo volume ajudam a recuperar erros de edição; a perda desse volume afeta também essas cópias. Prepare uma cópia periódica para outro armazenamento privado, de preferência com retenção e controle de acesso. A aplicação não contrata nem envia dados a serviços externos automaticamente.

A restauração verifica tudo por padrão, sem gravar dados:

```sh
npm run restore:backup -- --backup ./data/backups/NOME-DO-BACKUP
```

Para um ensaio de recuperação ou uma recuperação real, escolha um diretório novo ou vazio:

```sh
npm run restore:backup -- --backup ./data/backups/NOME-DO-BACKUP --destination ./data-restored --apply
```

O comando recusa substituir um diretório com dados, verifica as cópias e revoga as sessões e os links de recuperação restaurados. Os contadores de envio são preservados, para que restaurar um backup não reative links antigos nem zere o limite registrado nessa cópia. Usuários, artigos, histórico, rascunhos e arquivos são preservados; cada pessoa entra novamente com sua senha. Para colocar a recuperação em uso, pare a aplicação e aponte `DATA_DIR` para o diretório restaurado. Guarde o diretório anterior até conferir conteúdo, imagens, edital e acesso. O teste automatizado de recuperação usa apenas pastas temporárias e nunca o banco de desenvolvimento.

### Conteúdo institucional fixo

Edite `shared/content.cjs` para alterar a fonte dos títulos, textos e imagens institucionais. O banco publicado não é substituído automaticamente em reinícios ou builds. Para revisar quais campos fixos mudariam:

```sh
npm run content:institutional
```

O comando apenas lista os caminhos dos campos alterados. O processo seletivo e os contatos publicados permanecem com os dados atuais; o rascunho mantém suas próprias edições operacionais. Os artigos e arquivos não são alterados. Após revisar o relatório e aprovar a atualização institucional, execute explicitamente:

```sh
npm run content:institutional -- --apply
```

A aplicação cria e verifica um backup antes de gravar, usa uma transação e registra a atualização no histórico interno. Se o conteúdo mudar em outra sessão durante a preparação, a operação é cancelada para nova revisão. Esse comando altera diretamente a parte institucional publicada do ambiente selecionado; não o use como etapa automática de deploy.

### Verificação antes de liberar à equipe

```sh
npm run check:readiness -- --url http://127.0.0.1:3001
# No ambiente de produção, com suas variáveis configuradas:
npm run check:readiness -- --production --url https://SEU-DOMINIO
```

A verificação consulta saúde da API, conteúdo público, blog e painel; confere o build e, em produção, exige que o endereço verificado corresponda à origem HTTPS configurada. Também valida os IPs/CIDRs do proxy, as credenciais iniciais, o backup, a configuração de envio e o limite diário de recuperação. A resposta real de `/api/session` deve indicar visitante sem sessão, acesso demonstrativo desabilitado e recuperação por e-mail disponível. Isso confirma a configuração em execução; não verifica o domínio no Resend nem comprova entrega de e-mail. Não exibe senhas. Um retorno positivo comprova essas verificações, mas ainda exige validar persistência, recuperação, contas e monitoramento na hospedagem real. Consulte `GO_LIVE_STATUS.md` para os critérios de liberação.
