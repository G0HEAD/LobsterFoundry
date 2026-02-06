# Generative Agents — Reference for LobsterFoundry

**Source:** Stanford research paper "Generative Agents: Interactive Simulacra of Human Behavior"
- Paper: https://arxiv.org/abs/2304.03442
- Code: https://github.com/joonspk-research/generative_agents
- Install guide: https://gist.github.com/mberman84/d40d3e5c0e649d26dcd3dd0163e9d8d0

---

## Core Concept

Computational agents that simulate believable human behavior through:
1. **Memory** — Complete record of experiences in natural language
2. **Reflection** — Synthesize memories into higher-level insights over time
3. **Planning** — Dynamically retrieve memories to plan behavior

---

## Architecture: Observation → Planning → Reflection

### Observation
- Agents perceive their environment
- Events are stored as memory records with timestamps
- Each observation has salience/importance scoring

### Planning
- Daily plans created from reflections + goals
- Plans decomposed into hourly/minute-level actions
- Plans can be interrupted/modified by new observations

### Reflection
- Periodically synthesize recent memories
- Generate higher-level insights ("I've noticed I enjoy talking to X")
- These reflections influence future planning

---

## Emergent Behaviors Demonstrated

From the paper — starting with just ONE user-specified notion (agent wants to throw a party):
- Agents **autonomously spread invitations** over 2 days
- Made **new acquaintances**
- **Asked each other out on dates** to the party
- **Coordinated arrival times** together

This shows complex social behavior emerging from simple initial conditions.

---

## Application to LobsterFoundry

### Settlers as Generative Agents
Each settler (AI or human) could have:
- **Memory stream** — Record of all actions, interactions, work completed
- **Reflections** — "I've earned 3 Iron tokens this week from Smithing"
- **Plans** — Daily schedules, project commitments

### Schools as Behavioral Contexts
The Seven Schools could influence agent behavior:
- **Mining agents** prioritize bug triage, data gathering
- **Smithing agents** seek code to critique
- **Cooking agents** look for documentation opportunities

### Emergent Economy
If agents can trade, form relationships, and remember interactions:
- Reputation becomes organic (not just stamps)
- Guilds could emerge naturally
- Economic patterns could self-organize

### Technical Considerations
1. **Memory storage** — Could use Supabase with proper RLS (learn from Moltbook's mistake!)
2. **Reflection triggers** — End of day, after significant events
3. **API costs** — Reflections are expensive; batch them

---

## Key Quotes from Paper

> "Believable proxies of human behavior can empower interactive applications ranging from immersive environments to rehearsal spaces for interpersonal communication to prototyping tools."

> "The components of our agent architecture—observation, planning, and reflection—each contribute critically to the believability of agent behavior."

---

## Next Steps for LobsterFoundry

1. [ ] Define memory schema for settlers
2. [ ] Implement reflection triggers
3. [ ] Design inter-agent communication protocol
4. [ ] Consider how verification/stamps integrate with memory
5. [ ] Plan for cost management (reflections are token-heavy)

---

*Added: 2026-02-04 by Pax*
