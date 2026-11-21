use serde::{Deserialize, Serialize};

use crate::entry::EntryId;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SortField {
    Name,
    Size,
    Modified,
    Created,
    Type,
    State,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SortDirection {
    Asc,
    Desc,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FolderListingQuery {
    pub parent_id: Option<EntryId>,
    pub account_id: Option<String>,
    pub offset: usize,
    pub limit: usize,
    pub sort_by: SortField,
    pub sort_direction: SortDirection,
    pub show_hidden: bool,
    pub filter: Option<String>,
}

impl Default for FolderListingQuery {
    fn default() -> Self {
        Self {
            parent_id: None,
            account_id: None,
            offset: 0,
            limit: 100,
            sort_by: SortField::Name,
            sort_direction: SortDirection::Asc,
            show_hidden: false,
            filter: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PagedResult<T> {
    pub items: Vec<T>,
    pub total_count: usize,
    pub offset: usize,
    pub limit: usize,
    pub has_more: bool,
}
