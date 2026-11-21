use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NumberSequenceRule {
    pub start: usize,
    pub step: usize,
    pub padding: usize,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct BatchRenameRule {
    pub find_text: Option<String>,
    pub replace_text: Option<String>,
    pub prefix: Option<String>,
    pub suffix: Option<String>,
    pub number_sequence: Option<NumberSequenceRule>,
    pub change_extension: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BatchRenamePreview {
    pub entry_id: String,
    pub old_name: String,
    pub new_name: String,
}

impl BatchRenameRule {
    pub fn generate_new_name(&self, original_name: &str, index: usize) -> String {
        let (stem, ext) = match original_name.rfind('.') {
            Some(dot_idx) if dot_idx > 0 => {
                (&original_name[..dot_idx], &original_name[dot_idx + 1..])
            }
            _ => (original_name, ""),
        };

        // 1. Find and replace in stem
        let mut new_stem =
            if let (Some(find), Some(replace)) = (&self.find_text, &self.replace_text) {
                if !find.is_empty() {
                    stem.replace(find, replace)
                } else {
                    stem.to_string()
                }
            } else {
                stem.to_string()
            };

        // 2. Number sequencing
        if let Some(seq) = &self.number_sequence {
            let num = seq.start + index * seq.step;
            let formatted_num = format!("{:0width$}", num, width = seq.padding);
            new_stem = format!("{}_{}", new_stem, formatted_num);
        }

        // 3. Prefix & Suffix
        if let Some(prefix) = &self.prefix {
            new_stem = format!("{}{}", prefix, new_stem);
        }
        if let Some(suffix) = &self.suffix {
            new_stem = format!("{}{}", new_stem, suffix);
        }

        // 4. Extension
        let final_ext = if let Some(new_ext) = &self.change_extension {
            new_ext.trim_start_matches('.').to_string()
        } else {
            ext.to_string()
        };

        if final_ext.is_empty() {
            new_stem
        } else {
            format!("{}.{}", new_stem, final_ext)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_batch_rename_rule_combinations() {
        let rule = BatchRenameRule {
            find_text: Some("photo".to_string()),
            replace_text: Some("vacation".to_string()),
            prefix: Some("2026_".to_string()),
            suffix: Some("_raw".to_string()),
            number_sequence: Some(NumberSequenceRule {
                start: 1,
                step: 1,
                padding: 3,
            }),
            change_extension: Some("png".to_string()),
        };

        let res = rule.generate_new_name("photo_sunset.jpg", 0);
        assert_eq!(res, "2026_vacation_sunset_001_raw.png");

        let res2 = rule.generate_new_name("photo_beach.jpg", 1);
        assert_eq!(res2, "2026_vacation_beach_002_raw.png");
    }
}
