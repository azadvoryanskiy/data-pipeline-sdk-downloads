{{ config(severity = 'warn') }}
-- npm publishes two to three days late, PyPI one day late. Anything older than
-- this means the API or the pipeline has stalled.
select source, last_complete_day
from {{ ref('pipeline_health') }}
where last_complete_day < current_date - case source when 'npm' then 5 else 3 end
