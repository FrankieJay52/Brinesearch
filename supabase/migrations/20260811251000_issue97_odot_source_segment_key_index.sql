-- GitHub #97 — exact ODOT source-segment key lookup performance.
--
-- Carroll County's 4,587-row OGRIP run showed that the cached overlap stage was
-- still forced to evaluate 'OH:ODOT:SEGMENT:'||roadway_inventory_id broadly when
-- joining verified source_segment_keys back to the ODOT catalog. Keep the audited
-- exact-ID join unchanged and index that exact deterministic expression so the
-- planner can use a btree lookup. No fuzzy/name/nearest-road behavior is added.

create index if not exists brinesearch_odot_catalog_source_segment_key_issue97_idx
on public.brinesearch_odot_road_catalog
(('OH:ODOT:SEGMENT:'||roadway_inventory_id))
where source_active;

comment on index public.brinesearch_odot_catalog_source_segment_key_issue97_idx is
  'Issue #97 exact source_segment_key lookup index for OGRIP/ODOT materialization; identity matching remains exact and name-independent.';
