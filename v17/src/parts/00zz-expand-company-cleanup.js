    (function installExpandCompanyCleanupV17312() {
      const COUNTY_BY_LEGACY_ID = {
        "expand--alan-h-degarmo": "Brooke",
        "expand--albert-hohman": "Wetzel",
        "expand--alice-edge": "Ohio",
        "expand--altman": "Marshall",
        "expand--alton-stern": "Marshall",
        "expand--arthur-waryck": "Marshall",
        "expand--b-w-edge": "Marshall",
        "expand--ballato-brothers": "Brooke",
        "expand--barry-greathouse-a": "Brooke",
        "expand--barry-greathouse-b": "Brooke",
        "expand--benjamin-honecker": "Ohio",
        "expand--bethlehem-stage": "Ohio",
        "expand--betty-schafer": "Marshall",
        "expand--blatt": "Wetzel",
        "expand--bonnette": "Wetzel",
        "expand--brett-berrisford": "Wetzel",
        "expand--brian-dytko": "Ohio",
        "expand--brian-teslovich": "Brooke",
        "expand--brooke-county-parks": "Brooke",
        "expand--bryan-neel": "Marion",
        "expand--carl-rotter": "Ohio",
        "expand--chad-glauser": "Ohio",
        "expand--charles-frye": "Ohio",
        "expand--charles-jamison": "Marshall",
        "expand--charles-yoho": "Marshall",
        "expand--chk-a": "Wetzel",
        "expand--clarence-farmer": "Ohio",
        "expand--columbial-gas-transmission": "Marshall",
        "expand--constance-taylor": "Wetzel",
        "expand--craig-strope": "Marshall",
        "expand--dallas-hall": "Ohio",
        "expand--daniel-durig": "Wetzel",
        "expand--daniel-morris": "Marion",
        "expand--david-durig-lucky-d": "Wetzel",
        "expand--david-reinbeau": "Marshall",
        "expand--deborah-craig": "Ohio",
        "expand--edward-dremak": "Ohio",
        "expand--edward-nichols": "Ohio",
        "expand--edward-zatta": "Brooke",
        "expand--edwin-bunner": "Marion",
        "expand--ellsworth-davis": "Wetzel",
        "expand--esther-clark": "Monongalia",
        "expand--esther-weeks": "Ohio",
        "expand--floyd-johnson": "Wetzel",
        "expand--fork-ridge": "Marshall",
        "expand--franz-thoman": "Ohio",
        "expand--gary-kestner": "Ohio",
        "expand--geeta": "Marshall",
        "expand--george-gantzer": "Ohio",
        "expand--gerald-gourley": "Brooke",
        "expand--gladys-briggs": "Marshall",
        "expand--glenn-didriksen": "Ohio",
        "expand--gordon-stansberry": "Wetzel",
        "expand--gw-rentals": "Ohio",
        "expand--hammers": "Marshall",
        "expand--harold-langley": "Marion",
        "expand--hohman-hbp-south": "Wetzel",
        "expand--howard-shackelford": "Ohio",
        "expand--james-messenger": "Wetzel",
        "expand--james-seabright": "Brooke",
        "expand--john-good-jr": "Brooke",
        "expand--john-harwatt": "Brooke",
        "expand--john-hupp": "Brooke",
        "expand--kathy-mayhew": "Brooke",
        "expand--larry-ball": "Ohio",
        "expand--linda-greathouse": "Brooke",
        "expand--margaret-corbin": "Brooke",
        "expand--margaret-sue-kelley": "Wetzel",
        "expand--mark-edison": "Marshall",
        "expand--mark-hickman": "Ohio",
        "expand--mark-owen": "Brooke",
        "expand--martin-r-whiteman-jr": "Wetzel",
        "expand--mason-cottrell": "Ohio",
        "expand--mason-dixon": "Marshall",
        "expand--melvin-kahle": "Ohio",
        "expand--michael-dunn": "Marshall",
        "expand--michael-ratcliffe": "Ohio",
        "expand--michael-ryniawec": "Brooke",
        "expand--michael-southworth": "Marshall",
        "expand--mildred-mani": "Brooke",
        "expand--nick-ballato": "Brooke",
        "expand--occ-a": "Ohio",
        "expand--oe-burge": "Marshall",
        "expand--ov-royalty-trust": "Brooke",
        "expand--quality-reclamation": "Marion",
        "expand--randy-mcdowell-a": "Marshall",
        "expand--randy-mcdowell-b": "Marshall",
        "expand--ray-baker": "Marshall",
        "expand--rayle-coal-company": "Ohio",
        "expand--reliance-minerals": "Monongalia",
        "expand--ridgetop-land-ventures": "Wetzel",
        "expand--rine": "Wetzel",
        "expand--riter": "Wetzel",
        "expand--robert-baxter": "Wetzel",
        "expand--robert-bone": "Brooke",
        "expand--robert-young": "Marshall",
        "expand--roth": "Ohio",
        "expand--roy-ferrell": "Ohio",
        "expand--roy-riggle": "Ohio",
        "expand--russell-hervey": "Brooke",
        "expand--ruth-keller": "Marshall",
        "expand--saber": "Wetzel",
        "expand--samuel-hubbard": "Brooke",
        "expand--samuel-jones": "Brooke",
        "expand--schostag": "Marshall",
        "expand--serafin-ortiz": "Marshall",
        "expand--shannon-fields": "Ohio",
        "expand--shawn-couch": "Ohio",
        "expand--shawn-harlan": "Marshall",
        "expand--sonia-r": "Marshall",
        "expand--state-of-wv-dnr-a": "Brooke",
        "expand--state-of-wv-dnr-b": "Brooke",
        "expand--state-of-wv-dnr-c": "Brooke",
        "expand--swn-a": "Wetzel",
        "expand--thelma-hays": "Ohio",
        "expand--thomas-parkinson": "Brooke",
        "expand--thurman-speece": "Brooke",
        "expand--timmy-minch": "Ohio",
        "expand--van-aston": "Marshall",
        "expand--vernon-johnson": "Marshall",
        "expand--villers": "Marshall",
        "expand--violet-coss": "Brooke",
        "expand--wesbanco-bank": "Marion",
        "expand--william-ritchea": "Wetzel",
        "expand--william-rodgers": "Ohio",
        "expand--worthley": "Brooke",
        "expand--yocum": "Marshall"
      };
      const IMPORT_NOISE_IDS = new Set(["expand--expand-in-west-virginia", "expand--west-virginia"]);

      function isExpandWestVirginia(row) {
        return String(row?.company || "").trim().toLowerCase() === "expand"
          && ["west virginia", "wv"].includes(String(row?.state || "").trim().toLowerCase());
      }

      function countyLooksCorrupt(value) {
        const raw = String(value || "").replace(/\s+/g, " ").trim();
        return !raw || raw.length > 60 || (raw.match(/-/g) || []).length > 6 || raw.split(/\s+/).filter(Boolean).length > 10;
      }

      function cleanExpandRows(rows) {
        if (!Array.isArray(rows)) return 0;
        let repaired = 0;
        for (let i = rows.length - 1; i >= 0; i -= 1) {
          const row = rows[i];
          const id = String(row?._id || row?.legacy_id || "");
          if (IMPORT_NOISE_IDS.has(id)) {
            rows.splice(i, 1);
            continue;
          }
          if (!isExpandWestVirginia(row)) continue;
          const county = COUNTY_BY_LEGACY_ID[id];
          if (county && countyLooksCorrupt(row.county)) {
            row.county = county;
            row.countyAuditStatus = "reviewed";
            row.countyAuditMethod = "V17.3.12 Expand company cleanup";
            row.countyAuditDate = "2026-08-09";
            repaired += 1;
          }
        }
        return repaired;
      }

      const repairedPads = cleanExpandRows(pads);
      cleanExpandRows(padRecords);
      if (DB && Array.isArray(DB.pads) && DB.pads !== pads && DB.pads !== padRecords) cleanExpandRows(DB.pads);

      window.expandCompanyCleanupV17312 = {
        countyRepairs: repairedPads,
        importNoiseSuppressed: Array.from(IMPORT_NOISE_IDS)
      };
    })();
