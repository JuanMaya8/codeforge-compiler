# src/compiler

Código del compilador CodeForge, organizado por fases:

```
Código fuente → Lexer → Tokens → Parser → AST → Semántico → IR → VM
```

| Carpeta / archivo | Fase                         | Responsable  |
| ----------------- | ---------------------------- | ------------ |
| `tokens.ts`       | Contrato de tokens           | Jack-Limas   |
| `errors.ts`       | Contrato de errores          | Jack-Limas   |
| `lexer/`          | Análisis léxico              | Jack-Limas   |
| `ast/`            | Árbol de sintaxis abstracta  | Jack-Limas   |
| `parser/`         | Análisis sintáctico          | Jack-Limas   |
| `frontend.ts`     | Punto de entrada del frontend| Jack-Limas   |

Las carpetas del análisis semántico, IR y máquina virtual las crean sus
responsables (DeividJulian y JuanMaya8).

La documentación completa del frontend está en `docs/`.
