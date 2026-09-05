# Edição da imagem da USP

- Ferramenta: geração de imagens integrada (`image_gen`), modo de edição com referência.
- Referência: `src/assets/introduction/usp.avif` do commit `70d8f83`, recuperada do Git e convertida para PNG sem alteração visual.
- Arquivo mestre: `usp-editada.png`.
- Versão otimizada usada no site: `../../src/assets/introduction/usp.avif`.
- Finalidade: tratamento visual solicitado para o site; a imagem editada não documenta uma reforma real do prédio.

## Prompt utilizado

```text
Use case: precise-object-edit.
Asset type: realistic photographic image for the introduction of the Nexo Governamental website.
Input image 1 is the sole edit target and architectural reference: the ORIGINAL street photograph of the Faculdade de Direito da USP, Largo de São Francisco, with pale overcast daylight. Edit that real photograph, do not redesign or invent a different building.

Primary request: produce a more attractive, well-maintained but convincingly natural version of this exact photograph. Gently clean soot, stains and grime from the facade and stonework while preserving the original cream-gray colors, historic material texture, subtle patina, age, small imperfections and realistic detail. Remove the people lying or sitting on the sidewalk and their loose bedding/bags, and small litter, reconstructing the existing patterned pavement plausibly. The standing/walking pedestrians may remain discreetly as in the reference so the scene feels like an ordinary real street.

Preserve strictly: the original camera angle and vertical portrait framing (about 4:5), the true proportions and exact arrangement of columns, arches, windows, balconies, clock, ornament, neighboring building, palm trees, street and sidewalk. Keep the existing functional street poles/signs and ordinary urban details, without adding decorative lamps, flags, plants or architectural features. Preserve the exact existing inscription "FACULDADE DE DIREITO". Keep the full facade and street visible as in the original.

Lighting/style: soft natural daylight close to the original, with a slightly cleaner exposure and restrained color correction. Real photographic texture, subtle grain, believable shadows and moderate sharpness. The result should look like the same building photographed with a better camera after careful maintenance, not a newly reconstructed building.

Avoid: CGI, 3D-render appearance, glossy or plastic stone, over-smoothing, oversaturation, bright artificial blue sky, dramatic sunshine, HDR halos, fantasy architecture, altered lettering, invented details, excessive symmetry, cinematic effects, watermark or added text.
Output: one high-quality portrait image.
```
