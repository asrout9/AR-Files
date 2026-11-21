use serde::{Deserialize, Serialize};
use std::collections::VecDeque;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum UndoAction {
    Rename {
        entry_id: String,
        old_name: String,
        new_name: String,
    },
    BatchRename {
        renames: Vec<(String, String, String)>,
    },
    Move {
        entry_id: String,
        old_parent_id: Option<String>,
        new_parent_id: Option<String>,
    },
    Create {
        entry_id: String,
    },
    Copy {
        created_entry_ids: Vec<String>,
    },
    Trash {
        entry_ids: Vec<String>,
    },
}

#[derive(Debug, Default)]
pub struct UndoRedoStack {
    undo_stack: VecDeque<UndoAction>,
    redo_stack: VecDeque<UndoAction>,
    max_history: usize,
}

impl UndoRedoStack {
    pub fn new(max_history: usize) -> Self {
        Self {
            undo_stack: VecDeque::with_capacity(max_history),
            redo_stack: VecDeque::new(),
            max_history,
        }
    }

    pub fn push(&mut self, action: UndoAction) {
        if self.undo_stack.len() >= self.max_history {
            self.undo_stack.pop_front();
        }
        self.undo_stack.push_back(action);
        self.redo_stack.clear();
    }

    pub fn pop_undo(&mut self) -> Option<UndoAction> {
        let action = self.undo_stack.pop_back()?;
        self.redo_stack.push_back(action.clone());
        Some(action)
    }

    pub fn pop_redo(&mut self) -> Option<UndoAction> {
        let action = self.redo_stack.pop_back()?;
        self.undo_stack.push_back(action.clone());
        Some(action)
    }

    pub fn can_undo(&self) -> bool {
        !self.undo_stack.is_empty()
    }

    pub fn can_redo(&self) -> bool {
        !self.redo_stack.is_empty()
    }
}
