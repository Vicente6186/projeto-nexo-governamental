# Estado de entrega · Nexo Governamental

Revisão: 7 de setembro de 2026.

O site, o blog e o painel estão publicados em **https://nexo-governamental.netlify.app/**. O Netlify encaminha a aplicação ao Fastify no Railway. Login, proteção dos rascunhos, conteúdo público, imagens e descoberta para mecanismos de busca foram verificados pelo endereço HTTPS real. A recuperação por e-mail ainda depende do Resend; esta entrega não declara todos os critérios operacionais encerrados.

## Validação da versão

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
