# Revisão de imagens — 5 de setembro de 2026

Revisão de formato, nitidez, resolução, transparência e entrega. O inventário inclui 41 arquivos de imagem no diretório de fontes (inclusive exportações antigas mantidas como referência). Os originais recuperados estão em ../image-sources/README.md.

## Decisões aplicadas

- Fotos da galeria, faixas, cronograma e cartões: AVIF direto dos JPEGs originais, em vez de recomprimir a versão WebP já reduzida. Qualidade 75 e croma 4:4:4; cronograma 80. Nenhuma ampliação artificial nem regeneração de pessoas.
- Introdução: mantém o mestre PNG editado, com AVIFs de 560/840/1122 px (qualidade 70), WebP de compatibilidade, picture, seleção responsiva e prioridade alta. O enquadramento por cover considera a altura da tela no celular. Eliminada a cópia AVIF duplicada que o CSS emitia.
- Marca: PNG original de 250 × 256 extraído do antigo contêiner SVG; WebP lossless de 23.146 bytes em lugar de 49.122 bytes. Pixels RGBA idênticos. O arquivo não é apresentado como vetor.
- Ícones vetoriais continuam SVG; favicons continuam PNG/ICO. Seis PNGs foram recomprimidos sem perdas, com comparação RGBA exata. Instagram permanece WebP com alpha; imagem de compartilhamento preservada.
- Balão decorativo: WebP lossless gerado do PNG original, 956 → 678 bytes, alpha e pixels idênticos à fonte.
- Alvo: WebP animado lossless, 546.688 → 499.346 bytes, mesmos pixels visíveis, alpha, frames e duração.
- Pensamento: WebP animado transparente de 108 × 108 para exibição a 36 px até densidade 3×. Original WebM preservado. Novo formato pesa 371.764 bytes, mais que os 44.576 bytes do WebM, em troca da transparência compatível no WebKit; não houve redução de frames ou do movimento. A animação falante e o vídeo principal mantêm seus codecs; o principal passa a preload metadata.
- Faixa da Justiça: derivada de 1920 px em telas de densidade padrão; fonte completa permanece para alta densidade.
- Layout: dimensões declaradas, proporções preservadas, textos alternativos corrigidos e limites de ampliação em galeria/cartões no tablet e celular. Ícone de faculdade corrigido para o símbolo correspondente existente.
- Build: fontes antigas não utilizadas ficam fora da publicação; preservadas no repositório. Sitemap registra a data desta alteração significativa, sem alterar datas automaticamente a cada build.

## Comparação com os originais

PSNR de luminância em dB (maior indica menor erro em relação ao JPEG original decodificado). SSIM por blocos de 8 × 8 também aumentou nas 11 imagens; números completos em photo-quality.json. Métricas apoiam a comparação, sem substituir inspeção visual.

| Imagem | Resolução | Bytes antes → depois | PSNR antes → depois |
| --- | --- | --- | --- |
| politicians/presidente | 678 × 522 | 34.242 → 62.468 | 33.48 → 39.69 |
| politicians/deputados | 327 × 246 | 11.599 → 19.808 | 31.33 → 38.06 |
| politicians/ministro-do-trabalho | 327 × 247 | 8.154 → 12.488 | 33.59 → 40.44 |
| politicians/presidente-do-senado | 327 × 246 | 7.962 → 14.174 | 33.70 → 39.31 |
| politicians/vice-presidente-ministro | 327 × 218 | 11.338 → 22.617 | 29.26 → 36.44 |
| parallax/justice | 4096 × 2296 | 132.241 → 348.265 | 40.60 → 47.58 |
| parallax/usp | 892 × 733 | 102.935 → 200.037 | 30.33 → 36.52 |
| selective-process | 775 × 680 | 16.795 → 36.132 | 37.44 → 45.58 |
| more/school | 407 × 301 | 8.092 → 12.052 | 38.45 → 43.07 |
| more/planalto | 407 × 301 | 4.122 → 5.992 | 41.52 → 45.27 |
| more/calendar | 396 × 292 | 1.894 → 3.022 | 45.27 → 50.66 |

A prioridade é fidelidade: algumas fotos ficaram maiores para manter rostos, texto e textura. O pacote total não ficou menor; variantes responsivas e carregamento adiado controlam o que cada navegador precisa baixar. A principal parcela de bytes continua sendo os vídeos existentes.

## Limites das fontes

As quatro fotos secundárias têm somente 327 px de largura; os cartões têm aproximadamente 400 px; a foto panorâmica antiga da USP tem 892 px; o logo é raster de 250 × 256. Não há fontes maiores equivalentes e limpas no histórico. Para nitidez superior em telas Retina, são necessários originais em alta resolução ou a marca vetorial verdadeira. O tracing do favicon não é substituto fiel para a marca.

## Verificação

- Build de produção e verificação de diferenças sem erros.
- 43 referências locais resolvidas no build; 34 imagens raster/vetoriais referenciadas decodificadas, sem arquivo ausente.
- Comparações visuais dos originais e novas codificações; alpha e tempos das animações verificados.
- Navegador local: computador 1280 × 720, tablet 768 × 1024 e celular 390 × 844 verificados. As 22 imagens do documento carregaram; nenhuma imagem quebrada, rolagem horizontal ou erro de console. Máscara da introdução, cartões, galeria e transparência do pensamento conferidos visualmente.
- A publicação deve ser confirmada por HTTP comparando os arquivos servidos com os da pasta dist; o status do GitHub sozinho não comprova a versão do site.

## Referências técnicas

- https://web.dev/learn/performance/image-performance
- https://web.dev/articles/browser-level-image-lazy-loading
- https://developers.google.com/speed/webp/faq
- https://developers.google.com/search/docs/appearance/google-images
