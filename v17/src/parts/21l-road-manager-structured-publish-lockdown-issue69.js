    /* GitHub #69 — legacy publish lockdown.
       V17.3.27's direct DELETE/POST/PATCH publisher remains in historical source
       for regression context, but it must not remain callable once exact-route
       mode is assembled. Route publication has one runtime entrypoint only. */

    routeInteractivePublishV17327 = routeIssue69PublishStructured;
    window.routeInteractivePublishV17327 = routeIssue69PublishStructured;
    window.routeIssue69PublishEntryPoint = "brinesearch_publish_structured_route";
