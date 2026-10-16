-- One row per npm package per day, as the npm downloads API reported it.

select
    source,
    package,
    day::date                  as day,
    downloads::bigint          as downloads,
    fetched_at::timestamptz    as fetched_at
from {{ source('raw', 'npm') }}
