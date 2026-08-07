-- BrineSearch V17.3 review correction: attach named public source provenance
-- to records that already have an official pad match but no research_sources row.
update public.pads p
set research_sources = jsonb_build_array(
  jsonb_strip_nulls(
    jsonb_build_object(
      'type', case lower(coalesce(p.state,''))
        when 'ohio' then 'official_odnr_well_pad_layer'
        when 'pennsylvania' then 'official_padep_oil_gas_record'
        when 'west virginia' then 'official_wvges_oil_gas_record'
        else 'official_public_record'
      end,
      'agency', coalesce(
        nullif(p.extra_data->'official_pad_record'->>'agency',''),
        case lower(coalesce(p.state,''))
          when 'ohio' then 'Ohio Department of Natural Resources'
          when 'pennsylvania' then 'Pennsylvania Department of Environmental Protection'
          when 'west virginia' then 'West Virginia Geological and Economic Survey'
          else null
        end
      ),
      'service', case lower(coalesce(p.state,''))
        when 'ohio' then 'DOG_Services/WellPads public GIS layer'
        when 'pennsylvania' then 'PA Oil and Gas Mapping / PADEP public records'
        when 'west virginia' then 'WVGES Pipeline oil and gas well database'
        else coalesce(nullif(p.extra_data->'official_pad_record'->>'official_source',''),'Official public record')
      end,
      'checked', coalesce(nullif(p.extra_data->'official_pad_record'->>'matched_on',''),p.research_date::text),
      'official_source', nullif(p.extra_data->'official_pad_record'->>'official_source',''),
      'source_method', nullif(p.extra_data->'official_pad_record'->>'source_method',''),
      'record_id', coalesce(
        nullif(p.extra_data->'official_pad_record'->>'object_id',''),
        nullif(p.extra_data->'official_pad_record'->>'pad_id',''),
        nullif(p.extra_data->'official_pad_record'->>'source_api','')
      ),
      'url', case lower(coalesce(p.state,''))
        when 'ohio' then case
          when nullif(p.extra_data->'official_pad_record'->>'object_id','') is not null then
            'https://gis2.ohiodnr.gov/ArcGIS/rest/services/DOG_Services/WellPads/MapServer/1/query?where=OBJECTID%3D'
            || (p.extra_data->'official_pad_record'->>'object_id')
            || '&outFields=*&returnGeometry=true&f=pjson'
          else 'https://gis2.ohiodnr.gov/ArcGIS/rest/services/DOG_Services/WellPads/MapServer/1'
        end
        when 'pennsylvania' then 'https://gis.dep.pa.gov/PaOilAndGasMapping/'
        when 'west virginia' then 'https://www.wvgs.wvnet.edu/oginfo/pipeline/pipeline2_intro.asp'
        else null
      end
    )
  )
)
where p.extra_data ? 'official_pad_record'
  and (p.research_sources is null or p.research_sources='null'::jsonb or p.research_sources='[]'::jsonb);
