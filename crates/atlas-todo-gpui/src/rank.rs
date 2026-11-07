//! Fractional ranks for `sort_order`, ported from `@atlastodo/todo-core` (`rank.ts`, `reorder.ts`,
//! `boardMove.ts`): a moved row takes the midpoint of its new neighbours, and the siblings are
//! renumbered only when there is no room between them (ranks that tie, as unranked rows do).

/// `rankBetween`: the rank between the rows that will sit before and after the moved one.
pub fn rank_between(before: Option<f64>, after: Option<f64>) -> f64 {
    match (before, after) {
        (None, None) => 0.,
        (None, Some(a)) => a - 1.,
        (Some(b), None) => b + 1.,
        (Some(b), Some(a)) => (b + a) / 2.,
    }
}

/// `rankMoveWrites`: the `(id, sort_order)` writes that put `moved` at `to` among `siblings`
/// (in order; `moved` may be one of them, or come from elsewhere).
pub fn rank_move_writes(siblings: &[(String, f64)], moved: &str, to: usize) -> Vec<(String, f64)> {
    let others: Vec<&(String, f64)> = siblings.iter().filter(|(id, _)| id != moved).collect();
    let at = to.min(others.len());
    let before = at.checked_sub(1).map(|i| others[i].1);
    let after = others.get(at).map(|o| o.1);
    let rank = rank_between(before, after);
    if before.is_none_or(|b| rank > b) && after.is_none_or(|a| rank < a) {
        return vec![(moved.to_owned(), rank)];
    }
    let mut writes = Vec::new();
    let mut i = 0usize;
    for (n, o) in others.iter().enumerate() {
        if n == at {
            writes.push((moved.to_owned(), i as f64));
            i += 1;
        }
        if o.1 != i as f64 {
            writes.push((o.0.clone(), i as f64));
        }
        i += 1;
    }
    if at == others.len() {
        writes.push((moved.to_owned(), i as f64));
    }
    writes
}

/// One task write of a card or row move: its section, and its rank unless it is a subtask carried
/// along with its parent (which keeps its own rank among its siblings).
#[derive(Debug, Clone, PartialEq)]
pub struct MoveWrite {
    pub id: String,
    pub section_id: Option<String>,
    pub sort_order: Option<f64>,
}

/// `columnMoveWrites`: put `moved` at `to` among the cards of `to_section` (`column`, in order,
/// the moved card left out or not), carrying its subtree (`descendants`) when it changes section.
pub fn column_move_writes(
    column: &[(String, f64)],
    moved: &str,
    from_section: Option<&str>,
    to_section: Option<&str>,
    to: usize,
    descendants: &[(String, Option<String>)],
) -> Vec<MoveWrite> {
    let mut writes: Vec<MoveWrite> = rank_move_writes(column, moved, to)
        .into_iter()
        .map(|(id, rank)| MoveWrite {
            id,
            section_id: to_section.map(str::to_owned),
            sort_order: Some(rank),
        })
        .collect();
    if from_section != to_section {
        for (id, section) in descendants {
            if section.as_deref() != to_section {
                writes.push(MoveWrite {
                    id: id.clone(),
                    section_id: to_section.map(str::to_owned),
                    sort_order: None,
                });
            }
        }
    }
    writes
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rows(r: &[(&str, f64)]) -> Vec<(String, f64)> {
        r.iter().map(|(i, o)| (i.to_string(), *o)).collect()
    }

    #[test]
    fn midpoint_between_neighbours() {
        let s = rows(&[("a", 1.), ("b", 2.), ("c", 3.)]);
        assert_eq!(rank_move_writes(&s, "c", 1), vec![("c".into(), 1.5)]);
        assert_eq!(rank_move_writes(&s, "a", 2), vec![("a".into(), 4.)]);
        assert_eq!(rank_move_writes(&s, "x", 0), vec![("x".into(), 0.)]);
        assert_eq!(rank_move_writes(&[], "x", 5), vec![("x".into(), 0.)]);
    }

    #[test]
    fn ties_renumber() {
        let s = rows(&[("a", 0.), ("b", 0.), ("c", 0.)]);
        assert_eq!(
            rank_move_writes(&s, "c", 1),
            vec![("c".into(), 1.), ("b".into(), 2.)]
        );
    }

    #[test]
    fn subtree_follows_to_another_section() {
        let w = column_move_writes(
            &rows(&[("a", 1.)]),
            "m",
            None,
            Some("s"),
            1,
            &[("k".into(), None), ("j".into(), Some("s".into()))],
        );
        assert_eq!(w.len(), 2);
        assert_eq!(w[0].sort_order, Some(2.));
        assert_eq!(w[1].id, "k");
        assert_eq!(w[1].sort_order, None);
    }
}
