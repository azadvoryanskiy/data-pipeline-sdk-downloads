-- Average daily downloads per product per week (Monday to Sunday), npm and PyPI
-- added together. A week counts only when every source of the product has at
-- least five real days in it, so a lost day lowers the precision, not the level.

with by_source as (
    select
        product,
        category,
        source,
        date_trunc('week', day)::date        as week,
        avg(clean_downloads)                 as avg_daily,
        count(clean_downloads)               as good_days
    from {{ ref('int_downloads__flagged') }}
    group by all
),

sources_per_product as (
    select product, count(distinct source) as sources
    from {{ ref('packages') }}
    group by product
)

select
    b.product,
    b.category,
    b.week,
    sum(b.avg_daily)                                   as avg_daily_downloads,
    sum(case when b.source = 'npm' then b.avg_daily end)  as avg_daily_npm,
    sum(case when b.source = 'pypi' then b.avg_daily end) as avg_daily_pypi
from by_source as b
join sources_per_product as s using (product)
group by b.product, b.category, b.week, s.sources
having count(*) filter (where b.good_days >= 5) = s.sources
