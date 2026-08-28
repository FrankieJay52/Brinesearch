# Issue #97 — Ascent reviewed Google handoff batch 7 (2026-08-28)

## Scope and authority boundary

This batch adds five exact-record-bound reviewed Google Maps handoffs. It does not alter production data, road geometry, route/graph approval, public-Google publication, saved coordinates, or cutover. Every URL omits `origin`, so the phone supplies the current location. Google Maps remains an external handoff; BrineSearch does not load the Google Maps API or access a Google Maps API key.

All production evidence queries ran inside `BEGIN TRANSACTION READ ONLY` and ended with `ROLLBACK`. The reviewed routes remain `reviewed_handoff_authority_held`. A saved pad GPS is not relabeled as a verified entrance, and any movement beyond exact public-road evidence remains explicitly unapproved.

## Included exact records

### DUTTON — Belmont

- UUID / legacy / revision: `fbdb5ee4-38d6-4801-81cc-8ad4abbb24e2` / `ascent--dutton` / `1787459253071652`
- Exact stored sequence: `I-70 → Exit 213 → OH-331 → Dutton Dr → OR → OH-9 → OH-149 → OH-331 → Dutton Dr → OR → OH-331 → Dutton Dr`
- Saved destination: `40.150027,-81.017133`
- Ordered control: `40.143135410968,-81.033512001895`
- Exact junction: OH-331 / Dutton Drive at `40.1429384,-81.0337802`
- Control proof: 31.744 m inside exact `OH:ODOT:NLF:TBELTR01586**C`; point-to-line offset below 0.00001 m.
- Google turn-list proof: St. Clairsville and Cadiz both reach OH-331, turn onto Dutton Drive, and continue toward the saved pin without a loop or local-road backtrack.
- Boundary: the roughly 449 m tail from exact public Dutton Drive geometry to the saved pin remains an unapproved access/GPS handoff.

### KUNGLE B — Belmont

- UUID / legacy / revision: `ad5ef012-46f5-46ca-93c7-0f5b492cb201` / `ascent--kungle-b` / `1786258360881449`
- Exact stored sequence: `OH-2 → OH-872W → OH-7S → OH-148W → Potts Rd → OR → OH-556E → Clover Ridge Rd → OH-148E → Potts Rd → OR → OH-9 → OH-148E → Potts Rd`
- Saved destination: `39.88678,-80.87008`
- Ordered control: `39.886820116283,-80.869735364419`
- Exact junction: OH-148 / Potts Road at `39.8870901,-80.8695418`
- Control proof: 34.341 m inside exact `OH:ODOT:NLF:TBELTR00506**C`; point-to-line offset below 0.00001 m.
- Google turn-list proof: Powhatan Point and Barnesville approach OH-148 from opposite directions, turn onto Potts Road, and reach the saved pin without backtracking.
- Boundary: the saved pin remains destination evidence, not a verified entrance.

### TRUCHAN NW — Belmont

- UUID / legacy / revision: `c10e2066-d6b7-4117-aea9-137dd1237b3a` / `ascent--truchan-nw` / `1786258360881449`
- Exact stored sequence: `I-70 → Exit 216 → OH-9 → Shepherdstown Rd → Fairpoint Shepherdstown Rd → OR → OH-9 → Shepherdstown Rd → Fairpoint Shepherdstown Rd`
- Saved destination: `40.147814,-80.935886`
- Ordered controls: `40.151952334248,-80.961064815011`; `40.158630933940,-80.943718975075`
- Exact junctions: OH-9 / Shepherdstown at `40.1518707,-80.9613833`; Shepherdstown / Fairpoint-Shepherdstown at `40.1587016,-80.9439999`.
- Control proof: the first is 28.624 m inside exact CR-64 and clear of the OH-9 shared segment; the second is 25.203 m inside exact TR-216. Both offsets are below 0.00001 m.
- Google turn-list proof: St. Clairsville and Cadiz both follow OH-9 → Shepherdstown → Fairpoint-Shepherdstown → saved pin without backtracking. Google's `Shepardstown` spelling is renderer context only.
- Boundary: the saved pin remains destination evidence, not a verified entrance.

### MOONSTONE — Noble

- UUID / legacy / revision: `ca1560b5-4ea6-4eb7-a82e-de2467937eb2` / `ascent--moonstone` / `1786265812046205`
- Exact stored sequence: `OH-147 → OH-513 → OH-146 → Lew Marten Rd → Pad`
- Saved destination: `39.83664,-81.379628`
- Ordered control: `39.829803091222,-81.379580538853`
- Exact junction: OH-146 / Lew Martin Road at `39.829553026024,-81.379699127652`
- Control proof: 31.021 m along exact `OH:ODOT:NLF:TNOBTR00228**C`; point-to-line offset 0.000001 m.
- Google turn-list proof: Caldwell and Summerfield approach OH-146 from opposite directions, turn onto Lew Martin Road, and reach the saved pin without a local-road detour or backtrack.
- Naming boundary: the current record says `Lew Marten`; the exact official identity says `LEW MARTIN RD`.
- Authority boundary: the terminal `Pad` occurrence and final saved-GPS movement remain held and unapproved.

### JEFFCO — Harrison

- UUID / legacy / revision: `9aa065c0-8896-49e2-b02d-d4ca71acefc3` / `ascent--jeffco` / `1786265812046205`
- Exact stored sequence: `OH-151 → Rose Valley Rd → Beech Rd → Pad`
- Saved destination: `40.292482,-80.896856`
- Ordered controls: `40.3144086,-80.8963895`; `40.2968376,-80.9022309`
- Exact junctions: OH-151 / Rose Valley at `40.3145814,-80.8963556`; Rose Valley / Beech at `40.2968874,-80.9024415`.
- Destination proof: 2.25 m from exact Beech Road geometry and 0.4392 road-mile after the Beech turn, matching the saved 0.4-mile instruction.
- Google turn-list proof:
  - Cadiz: US-22 → OH-151 east → right Rose Valley → left Beech → 0.4 mile to destination.
  - Smithfield: OH-151 west → left Rose Valley → left Beech → 0.4 mile to destination.
- Boundary: the terminal `Pad` occurrence remains held and the saved pin is not relabeled as a verified entrance.

## Deliberate exclusions

- RECTOR-C was rejected after live Google validation. From Barnesville, Google used Leatherwood Road before Salem Road instead of staying on the intended state-road approach to the OH-313/Salem turn. With only three mobile waypoint slots, preserving every local turn while also preventing that shortcut was not proven.
- WAGLER was not added because its exact bound sequence still lacks an explicit highway anchor.
- SCOUT remains excluded because its saved point is about 81.7 m off CR-36 and no exact entrance coordinate proves where clipping should occur.
- TARBERT, BELLA, CRICKET, UNA, ECHO, FOXTROT, MONROE NORTH, PUGGLE/NOELLE, PHILLIPS, PACKER, BESECE, CREAMER, TARPLEY, LODESTAR, NORTH STAR, WINSTON SMITH, and the documented Belmont exclusions retain their existing GPS-only/held behavior. No route was inherited by name or proximity.

## Invariants

- Exactly five records change from GPS-only navigation to exact-record reviewed handoffs.
- COLOGIE's existing released route/handoff and all existing reviewed-held links, including BILINOVICH, LAWSON, and the prior six batches, remain byte-for-byte unchanged.
- URL contract: HTTPS Google `/maps/dir/`, `api=1`, `travelmode=driving`, `dir_action=navigate`, exact destination, one or two ordered controls, and no `origin`.
- Production writes: 0.
- Migrations: 0.
- Public-Google authority changes: 0.
- Route cutover changes: 0.
- Google Maps API usage or key access: 0.
