-- One row per PyPI package per day, as the pypistats.org reported it.

select
    source,
    package,
    day::date                  as day,
    downloads::bigint          as downloads,
    fetched_at::timestamptz    as fetched_at
from {{ source('raw', 'pypi') }}
