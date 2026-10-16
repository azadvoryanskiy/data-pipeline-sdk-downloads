-- A missing day or a dropout must never reach the cleaned numbers.
select *
from {{ ref('int_downloads__flagged') }}
where (is_missing_day or is_dropout) and clean_downloads is not null
