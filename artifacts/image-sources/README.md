# Fontes originais das imagens

Estes arquivos são os originais recuperados do histórico Git do próprio projeto. Foram preservados para gerar futuras versões de entrega diretamente da fonte, sem acumular perdas de JPEG → WebP → AVIF.

Os arquivos não foram ampliados, retocados ou recriados. As dimensões originais foram mantidas. Várias fotos antigas têm resolução baixa; alterar o formato não recupera detalhes inexistentes na fonte.

| Fonte preservada | Origem no Git | Dimensões |
| --- | --- | --- |
| `politicians/presidente.jpg` | `7dc268e:assets/politicians/presidente.jpg` | 678 × 522 |
| `politicians/deputados.jpg` | `7dc268e:assets/politicians/deputados.jpg` | 327 × 246 |
| `politicians/ministro-do-trabalho.jpg` | `7dc268e:assets/politicians/ministro-do-trabalho.jpg` | 327 × 247 |
| `politicians/presidente-do-senado.jpg` | `7dc268e:assets/politicians/presidente-senado.jpg` | 327 × 246 |
| `politicians/vice-presidente-ministro.jpg` | `7dc268e:assets/politicians/vice-presidente-ministro.jpg` | 327 × 218 |
| `parallax/justice.jpg` | `a81ead4:assets/parallax/justice.jpg` | 4096 × 2296 |
| `parallax/usp.jpg` | `a81ead4:assets/parallax/usp.jpg` | 892 × 733 |
| `selective-process.jpg` | `7dc268e:assets/selective-process.jpg` | 775 × 680 |
| `more/school.jpg` | `7dc268e:assets/more/school.jpg` | 407 × 301 |
| `more/planalto.jpg` | `7dc268e:assets/more/planalto.jpg` | 407 × 301 |
| `more/calendar.jpg` | `7dc268e:assets/more/calendar.jpg` | 396 × 292 |
| `speech-ballon.png` | `7dc268e:assets/speech-ballon.png` | 106 × 106 |

As fotos de entrega foram codificadas diretamente destas fontes usando Sharp 0.35.4, AVIF com qualidade 75, esforço 9 e subamostragem de croma 4:4:4. O cronograma usa qualidade 80 para preservar o texto rasterizado. O balão decorativo usa WebP lossless; os pixels RGBA foram verificados contra o PNG original.

A foto recentemente editada da introdução tem seu próprio mestre em `../usp/usp-editada.png` e não foi substituída por uma imagem histórica.

A marca `introduction/brand-original.png` foi extraída sem alterações do PNG de 250 × 256 embutido em `src/assets/introduction/brand-without-background.svg` (commit `e2c4aaa`). Seu WebP de entrega é lossless, com RGBA idêntico. O SVG anterior era apenas um contêiner de bitmap; não havia uma fonte vetorial limpa ou maior no histórico.

A introdução possui AVIFs de 560, 840 e 1122 px, qualidade 70 e croma 4:4:4, gerados do mestre PNG editado. O WebP de compatibilidade usa qualidade 94. A faixa da Justiça possui uma derivada AVIF de 1920 px, qualidade 75, para telas de densidade padrão; a imagem completa permanece disponível para alta densidade.
