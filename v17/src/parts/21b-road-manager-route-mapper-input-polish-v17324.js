    /* V17.3.24 — keep mileage entry focused while recalculating the draft total. */
    function routeMapperUpdateTotalV17324() {
      const host = document.getElementById("routeMapperTotalMiles");
      if (!host) return;
      const total = routeMapperMilesTotalV17324();
      host.textContent = total == null ? "Mileage not complete" : `${total.toFixed(2)} mi entered`;
    }

    const routeMapperRenderSegmentsBeforeInputPolishV17324 = routeMapperRenderSegmentsV17324;
    routeMapperRenderSegmentsV17324 = function routeMapperRenderSegmentsInputPolishV17324() {
      routeMapperRenderSegmentsBeforeInputPolishV17324();
      document.querySelectorAll("[data-route-mapper-miles]").forEach(input => {
        input.oninput = () => {
          const index = Number(input.dataset.routeMapperMiles);
          if (!routeMapperSegmentsV17324[index]) return;
          routeMapperSegmentsV17324[index].miles = input.value;
          routeMapperDraftSaveV17324();
          routeMapperUpdateTotalV17324();
        };
      });
      routeMapperUpdateTotalV17324();
    };
