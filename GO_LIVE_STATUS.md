# Estado de entrega · Nexo Governamental

Revisão: 8 de setembro de 2026.

O site, o blog e o painel estão publicados em **https://nexo-governamental.netlify.app/**. O Netlify encaminha a aplicação ao Fastify no Railway. Login, proteção dos rascunhos, conteúdo público, imagens e descoberta para mecanismos de busca foram verificados pelo endereço HTTPS real. A recuperação por e-mail ainda depende do Resend; esta entrega não declara todos os critérios operacionais encerrados.

## Auditoria de código de 8 de setembro

A revisão corrigiu operações em andamento que conseguiam gravar após o logout e uploads com partes extras que retornavam erro interno. A sessão persistida agora é conferida antes da operação e novamente após recebimento de arquivos, processamento de imagens e cálculo de senhas; o envio inteiro é validado antes da gravação.

O editor ignora respostas de visitas anteriores a um artigo e mantém o campo Markdown aberto durante a remoção de sintaxe não suportada. Consultas antigas da equipe deixam de sobrescrever a tela atual, e os modais pulam campos ocultos ou desabilitados ao navegar pelo teclado. Imagens locais no corpo dos artigos são verificadas ao salvar e publicar; links de imagem incompatíveis são rejeitados com indicação do campo. O aviso de atualização segue a mesma data de Brasília exibida ao leitor.

No site, inscrições abrem e encerram nas datas configuradas mesmo quando a página permanece aberta ou volta de uma suspensão. Cronogramas sem imagem e sem etapas ficam ocultos. Nos backups, a cópia recém-verificada permanece protegida quando o relógio retrocede, e destinos dentro das pastas de mídia são rejeitados também quando passam por um diretório simbólico.

- Instalação limpa pelo lockfile: concluída com Node.js 24.15.0; nenhuma vulnerabilidade reportada pelo npm.
- `npm test`: **171 testes passaram**, incluindo regressões de sessão revogada, respostas atrasadas, imagens, prazo de inscrições e restauração de backup após ajuste do relógio.
- `npm run test:e2e`: **51 cenários passaram** no Chromium, incluindo contas, recuperação, publicação, categorias, rascunhos, teclado, temas e telas estreitas.
- `npm run build`: concluído, com os dois avisos de tamanho de mídia e pacotes já existentes.
- Readiness e SEO locais aprovados em servidor isolado; rotas administrativas de conteúdo, categorias e contas responderam 401 sem sessão. Os cenários de artigos publicados são verificados nas suítes com dados temporários.

As verificações desta auditoria usam bancos temporários e transporte de e-mail simulado. As evidências de hospedagem nas seções seguintes pertencem às publicações anteriores; a atualização desta revisão no Railway e no domínio público precisa de confirmação própria.

## Animações do painel publicadas

A implementação `787a6e87d85d7272fbddb7ac8f8b6eb059f83771` adiciona entradas discretas, transições entre etapas, abertura de janelas e respostas nos controles, preservando a paleta azul. As animações respeitam movimento reduzido; a rolagem das etapas também respeita essa preferência. O build, 7 testes de lógica relacionados e 25 cenários de interação passaram.

- Publicação confirmada: deploy `76533b90-7105-4d95-8a27-0b8deba706ee`, estado `SUCCESS`, fonte enviada `406f7af` (a implementação mais o registro de validação), em 8 de setembro de 2026 UTC.
- O HTML público de `/admin/` e os arquivos `admin.38c1b017.js` e `admin.8685a308.css` foram comparados byte a byte com o build validado. `/api/health` respondeu 200 e a API de categorias manteve a exigência de autenticação.
- A tentativa anterior `8f45fa10-aed8-4b94-a007-0d8675ac0333` falhou na preparação por um erro interno da Railway: a coluna `Workspace.supportTierOverride` não existia no banco do provedor. Após o acesso ao serviço voltar, a nova tentativa concluiu a publicação. Nenhuma alteração no banco, plano ou serviço da aplicação foi necessária.

## Refinamento do painel publicado

O Nexo Studio recebeu navegação mais enxuta, cores mais sóbrias nos temas claro e escuro, tipografia consistente, contatos com prévia lateral e menos títulos, subtítulos e instruções repetidas. Blog, processo seletivo, login, contas e recuperação de acesso seguem os mesmos fluxos. Avisos de publicação, erros e orientações de acessibilidade foram preservados.

- Fonte da aplicação: `36f60f5e7222ed42735c215b3381dfdb41405297`.
- Railway: deploy `bbe54252-4fa3-484b-a0dd-eeae8b56244f`, estado `SUCCESS`, em 8 de setembro de 2026 UTC (7 de setembro em Brasília).
- Validação local: 151 testes de lógica aprovados. Dos 49 cenários de navegador, 44 passaram inicialmente; os cinco afetados pelos novos textos e descrições acessíveis passaram depois dos ajustes. Os cenários incluem teclado, temas, telas estreitas, contas, rascunhos, publicação e recuperação.
- Build final aprovado, com os dois avisos de tamanho de mídia/pacotes já conhecidos. O HTML de `/admin/` e os arquivos `admin.dc91dcc9.js` e `admin.0a3ec00b.css` publicados foram conferidos byte a byte contra o build local.
- `/api/health` respondeu 200. O conteúdo retornado por `/api/content` permaneceu idêntico ao registro anterior à publicação; o acesso da equipe no rodapé também foi preservado. A verificação de SEO pelo domínio público passou, ainda sem artigos publicados para amostragem.
- Backup anterior à atualização: `/app/data/studio-design-backups/nexo-backup-2026-09-08T01-41-12-980Z-9f3c4968-0109-4770-8434-e44e256e1c8f`, verificado pelo procedimento da aplicação, sem remoção de cópias anteriores.

## Revisão de código posterior à publicação registrada

A revisão do checkout corrigiu concorrência no limite de login, validação de credenciais e conteúdo, troca indevida de identidade ao renovar CSRF, recuperação de rascunhos, preservação do endereço e das palavras-chave durante o salvamento e histórico de desfazer após recuperar uma revisão. Também corrigiu sumário e RSS do blog, manutenção da navegação nas prévias, limpeza após falhas de backup/restauração e geração do template do blog no desenvolvimento.

No site, foram ajustados links de e-mail, imagem e rótulos do CMS, contraste do processo seletivo e respeito à preferência por movimento reduzido. A tela de login agora cabe em celulares pequenos.

- `npm test`: **151 testes passaram**, incluindo regressões reproduzidas antes das correções.
- Chromium: **49 cenários passaram**, incluindo isolamento entre contas em abas diferentes e login em telas de 320, 375 e 390 px. Escritas somente em bancos temporários.
- Build de produção concluído; permanecem os dois avisos de tamanho de mídia/pacotes.
- `npm audit`: nenhuma vulnerabilidade reportada, incluindo dependências de desenvolvimento.
- SEO e readiness locais aprovados em servidor isolado. Site, blog e login conferidos em 320, 375, 768 e 1.440 px, sem transbordamento horizontal ou erros de JavaScript; cinco imagens de reconhecimento carregadas e decodificadas.

Estas correções estão incluídas na publicação do refinamento do painel registrada acima. As evidências de hospedagem abaixo descrevem a instalação anterior. As pendências operacionais continuam válidas.

## Validação da publicação anterior

- `npm test`: **120 testes passaram**. Cobrem API, usuários, conteúdo, blog, upload, versões, temas, recuperação, redefinição de senha, sitemaps, canonical, dados estruturados, imagens responsivas e proteção das prévias.
- `npm run test:e2e`: **47 cenários passaram** no Chromium. Incluem publicação e prévias, capas, versões, recuperação entre abas, renovação de sessão, etapas dos formulários, Desfazer, teclado, temas e telas estreitas. Os testes de escrita usaram bancos temporários isolados.
- `npm run build`: concluído. Permanecem avisos de tamanho de mídia institucional e pacotes JavaScript; o editor visual é carregado quando necessário. Não foi realizada uma nova medição de Core Web Vitals com tráfego real após o deploy.
- `npm audit --omit=dev`: nenhuma vulnerabilidade reportada nesta revisão.
- Docker: imagem executada com Node 24, volume temporário, ambiente de produção e processo da aplicação em UID/GID 1000. Site, blog, sitemap, CSP e geração de WebP passaram. O Compose mantém usuário 1000 e todas as capacidades removidas; a permissão de escrita no volume foi conferida.
- O verificador `npm run check:seo` passou no Docker local, no endereço Railway e no domínio público Netlify. Casos negativos confirmaram que ele rejeita bloqueio por `noindex`, robots impedindo rastreamento e XML truncado.

## Publicação e persistência

| Item | Evidência |
| --- | --- |
| Railway | Projeto e serviço `nexo-governamental`; projeto `8e16e118-4df9-4a36-90ec-4c1f028fe8e6`, ambiente `production`. |
| Serviço Node | `https://nexo-governamental-production.up.railway.app`; uma instância, porta 3001. |
| Armazenamento | Volume `42b255da-186a-4e04-b425-eacb3f398a1a` em `/app/data`; banco ativo em `/app/data/nexo`. |
| Origem canônica | `CMS_ORIGIN=https://nexo-governamental.netlify.app`; site, painel e API na mesma origem para a equipe. |
| Deploy Railway validado | `7deb9718-1838-4110-9c37-54a0d39d9581`, status `SUCCESS`, após substituir o contêiner com a base restaurada. O manifesto confirmou `/api/health`, timeout de 120 segundos e reinício `ON_FAILURE` com cinco tentativas. |
| Deploy Netlify validado | `6a9f489183c75d5eb45869b5`, no site existente `a110ae89-14a7-44cd-ac6e-ef67004f304a`. |
| Retorno público | `/`, `/blog/`, `/admin/`, `/api/health`, robots, sitemaps e arquivo de verificação Google responderam corretamente. |
| Autenticação | Login de Vicente confirmado; cookie Secure, HttpOnly e SameSite=Strict, respostas da API sem cache. A sessão de teste foi encerrada. |
| Acesso privado | Conteúdo administrativo sem sessão: 401. Acesso de apresentação: 404. Painel e prévias fora do índice; prévias exigem login. |
| Imagens | Variante pública de 480 × 600 px gerada e recebida através do Netlify. Originais privados preservados. |
| Recuperação | Backup consistente local transferido por SSH para diretório privado novo e verificado antes de ativar. A restauração revogou sessões e tokens anteriores. |
| Backup automático | Cópia gerada no Railway em `2026-09-07T23:27:22.946Z`, com manifesto e integridade SQLite verificados. Retenção configurada em 14 cópias e intervalo de 24 horas. |

O conteúdo publicado permaneceu na versão 1, com SHA-256 `9e0343fffa5a3c61f72c202d50f1ebeaedb3e9b5789a59963679b56086f553da`. O rascunho do site permaneceu na versão 4. Os três artigos continuam na versão 1, como rascunhos, com **zero artigos publicados**. A conferência depois da substituição do contêiner e o acesso pela API pública confirmaram essa preservação. Nenhum artigo demonstrativo foi publicado.

A senha existente de Vicente foi preservada, sem registro no código ou nesta documentação. A infraestrutura foi criada com autorização do usuário na conta Railway existente; há consumo adicional de serviço e volume, sem contratação de novo plano.

## SEO entregue

- HTML completo das publicações, títulos, resumos e URLs canônicas.
- `BlogPosting` e `BreadcrumbList` com autoria, datas, categoria e imagens da versão publicada. Editora identificada como Nexo Governamental XI de Agosto; nenhuma autoria ou chancela editorial da USP foi inventada.
- Dados estruturados escapados e permitidos pela política de segurança somente por hashes do conteúdo exato.
- Sitemaps dinâmicos para artigos e categorias publicados, com imagens e datas de atualização; retirada automática ao despublicar ou arquivar.
- Paginação com canonical próprio, normalização de endereços, páginas inexistentes com 404 e buscas internas sem indexação.
- Capas responsivas com dimensões reais, WebP, carregamento prioritário da capa principal e adiado nos cartões. Cache e processamento limitados; sem baixar imagens externas no servidor.
- Orientações editoriais e comando de conferência documentados no README.

A propriedade `https://nexo-governamental.netlify.app/` já estava acessível na conta de Vicente no Google Search Console. O sitemap foi reenviado após a publicação e a interface confirmou **“Sitemap enviado”**. O recebimento não comprova rastreamento dos novos endereços, indexação dos artigos nem posição no Google. Ainda não existem artigos públicos para verificar resultados avançados ou desempenho orgânico dessa nova área. A equipe precisa publicar conteúdo real, com autoria e fontes, para essa avaliação.

## Pendências operacionais

| Critério | Situação |
| --- | --- |
| Recuperação por e-mail | Implementada, porém indisponível em produção (`passwordResetAvailable: false`). Faltam chave e remetente Resend escolhido e teste de recebimento. Gmail e o subdomínio padrão netlify.app não substituem um domínio de envio verificado. |
| Backup externo periódico | Há cópia privada local usada na migração e backups automáticos no volume. Falta rotina periódica para um segundo armazenamento; perder o volume também afeta as cópias dentro dele. |
| Equipe | Vicente tem acesso administrativo confirmado. Demais integrantes precisam de contas individuais e responsabilidades definidas. |
| Monitoramento e custos | Healthcheck e reinício estão configurados. Falta definir a rotina do responsável para disponibilidade, falhas de backup e consumo Railway. |
| Proxy e limites | Nenhum proxy foi confiado indiscriminadamente. `CMS_TRUST_PROXY` permanece vazio; limites por IP podem agrupar usuários do proxy. Só configurar IPs/CIDRs específicos após validar a origem real. |
| Revisão editorial | Processo seletivo, contatos, direitos de imagens, fontes e primeiros artigos dependem da revisão institucional da equipe. |
| Acompanhamento de busca | Sitemap recebido. Indexação, rich results e posições dos futuros artigos precisam ser acompanhados no Search Console. Nenhuma posição foi prometida. |

A integração Resend foi testada com transporte simulado: link único, validade de 30 minutos, troca, revogação das sessões, rejeição de reutilização e persistência após reinício. Nenhum e-mail real foi enviado. O readiness de produção continua exigindo essa configuração e não deve ser tratado como aprovado integralmente enquanto ela estiver ausente.

Para atualizar a aplicação, preserve o volume, as variáveis privadas e a origem pública. Não substitua o banco em uso nem publique o diretório de dados. Valide build e testes, faça backup e repita `check:seo` pelo checkout local. Publicar código no GitHub não é prova de atualização no Railway ou Netlify: confira também os provedores e o endereço HTTPS.
