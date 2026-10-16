-- Every package in the seed must have arrived from its source. A renamed or
-- deleted package would otherwise just vanish from the dashboard.
select p.source, p.package
from {{ ref('packages') }} as p
left join {{ ref('fct_downloads_daily') }} as f using (source, package)
where f.package is null
