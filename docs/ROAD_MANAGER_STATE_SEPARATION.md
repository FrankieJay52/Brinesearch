# Road Manager state separation

Road Manager groups roads with these rules:

- Interstates/freeways are shared across state lines. Example: I-70 is one freeway family with state coverage attached.
- U.S. routes keep their own U.S.-route family and never merge with a same-number state route.
- State routes are state-specific. Example: OH-2 and WV-2 are different families.
- Local, county, township, lease, and access roads are state-specific and retain county/township scope when available.
- Directional labels such as eastbound or southbound belong to the pad route step, not a duplicate master-road record.
- None of these grouping rules permit guessing an unknown local-road route.
