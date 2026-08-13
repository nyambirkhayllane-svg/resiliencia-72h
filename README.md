# RESILIÊNCIA 72H — Centro de Comando Energético

Aplicação web funcional para comparar uma microrrede convencional com uma solução resiliente durante 72 horas de evento climático extremo.

## Executar

```powershell
python -m http.server 4173 --bind 127.0.0.1
```

Abrir `http://127.0.0.1:4173`.

## Capacidades

- Balanço energético horário determinístico para dois sistemas sob o mesmo clima e procura.
- Limites de capacidade, reserva, eficiência e potência da bateria.
- Biomassa limitada por potência, combustível, consumo específico, eficiência, humidade e disponibilidade.
- Perfis e prioridades separados para saúde, água, comunicações, iluminação e outras cargas.
- Estratégias de distribuição igual, eficiência energética e protecção da vida.
- Energia crítica não servida e blackout mostrados sem ocultar resultados negativos.
- Falhas injectadas com recálculo do plano.
- Despacho de drones validado por janela meteorológica, vento, alcance, carga útil e kits.
- Monte Carlo de 100, 500 ou 1.000 cenários com semente reproduzível e execução não bloqueante.
- Exportação horária para CSV e modo de demonstração para o júri.
- Metodologia, fórmulas e pressupostos visíveis na interface.

## Estrutura

- `engine.js`: motor energético e validação de missões.
- `app.js`: estado, visualização, eventos, Monte Carlo e exportação.
- `index.html`: estrutura do centro de comando.
- `styles.css`: apresentação responsiva para computador e tablet.

Os valores iniciais são hipóteses ilustrativas e precisam de substituição por dados técnicos validados antes de qualquer decisão de engenharia ou investimento.
