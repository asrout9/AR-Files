use parking_lot::RwLock;
use std::collections::HashMap;

/// Thread-safe manager mapping SQLite string EntryIds to 64-bit FUSE inode numbers.
#[derive(Debug)]
pub struct InodeManager {
    id_to_ino: RwLock<HashMap<String, u64>>,
    ino_to_id: RwLock<HashMap<u64, String>>,
    next_ino: RwLock<u64>,
}

impl InodeManager {
    pub const ROOT_INO: u64 = 1;

    pub fn new() -> Self {
        let mut id_to_ino = HashMap::new();
        let mut ino_to_id = HashMap::new();

        id_to_ino.insert("root".to_string(), Self::ROOT_INO);
        ino_to_id.insert(Self::ROOT_INO, "root".to_string());

        Self {
            id_to_ino: RwLock::new(id_to_ino),
            ino_to_id: RwLock::new(ino_to_id),
            next_ino: RwLock::new(2),
        }
    }

    pub fn get_or_create_ino(&self, entry_id: &str) -> u64 {
        if entry_id == "root" {
            return Self::ROOT_INO;
        }

        {
            let map = self.id_to_ino.read();
            if let Some(&ino) = map.get(entry_id) {
                return ino;
            }
        }

        let mut id_map = self.id_to_ino.write();
        let mut ino_map = self.ino_to_id.write();
        let mut next = self.next_ino.write();

        if let Some(&ino) = id_map.get(entry_id) {
            return ino;
        }

        let ino = *next;
        *next += 1;

        id_map.insert(entry_id.to_string(), ino);
        ino_map.insert(ino, entry_id.to_string());

        ino
    }

    pub fn get_entry_id(&self, ino: u64) -> Option<String> {
        self.ino_to_id.read().get(&ino).cloned()
    }
}

impl Default for InodeManager {
    fn default() -> Self {
        Self::new()
    }
}
