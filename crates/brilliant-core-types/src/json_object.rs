//! Insertion-ordered JSON fields with indexed key lookup. Equality remains
//! map equality; callers needing observable property order use `iter()`.
use serde::{
    Deserialize, Deserializer, Serialize, Serializer,
    de::{MapAccess, Visitor},
    ser::SerializeMap,
};
use std::{borrow::Borrow, collections::BTreeMap, fmt, ops::Index};

#[derive(Clone)]
pub struct JsonObject<K, V> {
    entries: Vec<(K, V)>,
    positions: BTreeMap<K, usize>,
}

impl<K, V> Default for JsonObject<K, V> {
    fn default() -> Self {
        Self {
            entries: Vec::new(),
            positions: BTreeMap::new(),
        }
    }
}
impl<K, V> JsonObject<K, V> {
    pub fn new() -> Self {
        Self::default()
    }
    pub fn len(&self) -> usize {
        self.entries.len()
    }
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }
    pub fn clear(&mut self) {
        self.entries.clear();
        self.positions.clear();
    }
    pub fn iter(&self) -> impl DoubleEndedIterator<Item = (&K, &V)> + ExactSizeIterator {
        self.entries.iter().map(|(key, value)| (key, value))
    }
    pub fn iter_sorted(&self) -> impl DoubleEndedIterator<Item = (&K, &V)> + ExactSizeIterator {
        self.positions
            .iter()
            .map(|(key, index)| (key, &self.entries[*index].1))
    }
    pub fn keys(&self) -> impl DoubleEndedIterator<Item = &K> + ExactSizeIterator {
        self.entries.iter().map(|(key, _)| key)
    }
    pub fn values(&self) -> impl DoubleEndedIterator<Item = &V> + ExactSizeIterator {
        self.entries.iter().map(|(_, value)| value)
    }
    pub fn values_mut(&mut self) -> impl DoubleEndedIterator<Item = &mut V> + ExactSizeIterator {
        self.entries.iter_mut().map(|(_, value)| value)
    }
    pub fn into_values(self) -> impl DoubleEndedIterator<Item = V> + ExactSizeIterator {
        self.entries.into_iter().map(|(_, value)| value)
    }
}
impl<K: Ord, V> JsonObject<K, V> {
    pub fn get<Q: Ord + ?Sized>(&self, key: &Q) -> Option<&V>
    where
        K: Borrow<Q>,
    {
        self.positions.get(key).map(|index| &self.entries[*index].1)
    }
    pub fn get_key_value<Q: Ord + ?Sized>(&self, key: &Q) -> Option<(&K, &V)>
    where
        K: Borrow<Q>,
    {
        self.positions.get(key).map(|index| {
            let (key, value) = &self.entries[*index];
            (key, value)
        })
    }
    pub fn get_mut<Q: Ord + ?Sized>(&mut self, key: &Q) -> Option<&mut V>
    where
        K: Borrow<Q>,
    {
        self.positions
            .get(key)
            .map(|index| &mut self.entries[*index].1)
    }
    pub fn contains_key<Q: Ord + ?Sized>(&self, key: &Q) -> bool
    where
        K: Borrow<Q>,
    {
        self.positions.contains_key(key)
    }
    pub fn remove_entry<Q: Ord + ?Sized>(&mut self, key: &Q) -> Option<(K, V)>
    where
        K: Borrow<Q>,
    {
        let index = self.positions.remove(key)?;
        let removed = self.entries.remove(index);
        for position in self.positions.values_mut() {
            if *position > index {
                *position -= 1;
            }
        }
        Some(removed)
    }
    pub fn remove<Q: Ord + ?Sized>(&mut self, key: &Q) -> Option<V>
    where
        K: Borrow<Q>,
    {
        self.remove_entry(key).map(|(_, value)| value)
    }
}
impl<K: Ord + Clone, V> JsonObject<K, V> {
    pub fn insert(&mut self, key: K, value: V) -> Option<V> {
        if let Some(index) = self.positions.get(&key) {
            return Some(std::mem::replace(&mut self.entries[*index].1, value));
        }
        self.positions.insert(key.clone(), self.entries.len());
        self.entries.push((key, value));
        None
    }
}
impl<K: Ord + Clone, V> FromIterator<(K, V)> for JsonObject<K, V> {
    fn from_iter<T: IntoIterator<Item = (K, V)>>(iter: T) -> Self {
        let mut result = Self::new();
        for (key, value) in iter {
            result.insert(key, value);
        }
        result
    }
}
impl<K: Ord + Clone, V, const N: usize> From<[(K, V); N]> for JsonObject<K, V> {
    fn from(entries: [(K, V); N]) -> Self {
        entries.into_iter().collect()
    }
}
impl<K, V> IntoIterator for JsonObject<K, V> {
    type Item = (K, V);
    type IntoIter = std::vec::IntoIter<Self::Item>;
    fn into_iter(self) -> Self::IntoIter {
        self.entries.into_iter()
    }
}
impl<'a, K, V> IntoIterator for &'a JsonObject<K, V> {
    type Item = (&'a K, &'a V);
    type IntoIter = std::iter::Map<std::slice::Iter<'a, (K, V)>, fn(&'a (K, V)) -> Self::Item>;
    fn into_iter(self) -> Self::IntoIter {
        self.entries.iter().map(|(key, value)| (key, value))
    }
}
impl<K: PartialEq, V: PartialEq> PartialEq for JsonObject<K, V> {
    fn eq(&self, other: &Self) -> bool {
        self.len() == other.len()
            && self
                .positions
                .iter()
                .zip(&other.positions)
                .all(|((left, li), (right, ri))| {
                    left == right && self.entries[*li].1 == other.entries[*ri].1
                })
    }
}
impl<K: Eq, V: Eq> Eq for JsonObject<K, V> {}
impl<K: fmt::Debug, V: fmt::Debug> fmt::Debug for JsonObject<K, V> {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.debug_map().entries(self.iter()).finish()
    }
}
impl<K: Ord + Borrow<Q>, V, Q: Ord + ?Sized> Index<&Q> for JsonObject<K, V> {
    type Output = V;
    fn index(&self, key: &Q) -> &V {
        self.get(key).expect("JSON object key")
    }
}
impl<K: Serialize, V: Serialize> Serialize for JsonObject<K, V> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut object = serializer.serialize_map(Some(self.len()))?;
        for (key, value) in self {
            object.serialize_entry(key, value)?;
        }
        object.end()
    }
}
impl<'de, K: Deserialize<'de> + Ord + Clone, V: Deserialize<'de>> Deserialize<'de>
    for JsonObject<K, V>
{
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct ObjectVisitor<K, V>(std::marker::PhantomData<(K, V)>);
        impl<'de, K: Deserialize<'de> + Ord + Clone, V: Deserialize<'de>> Visitor<'de>
            for ObjectVisitor<K, V>
        {
            type Value = JsonObject<K, V>;
            fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
                formatter.write_str("JSON object")
            }
            fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Self::Value, A::Error> {
                let mut object = JsonObject::new();
                while let Some((key, value)) = map.next_entry()? {
                    if object.insert(key, value).is_some() {
                        return Err(serde::de::Error::custom("duplicate JSON key"));
                    }
                }
                Ok(object)
            }
        }
        deserializer.deserialize_map(ObjectVisitor(std::marker::PhantomData))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn updates_keep_position_and_reinsertions_append() {
        let mut object = JsonObject::from([("z", 0), ("a", 1), ("m", 2)]);
        assert_eq!(object.insert("a", 3), Some(1));
        assert_eq!(object.remove("z"), Some(0));
        assert_eq!(object.get("m"), Some(&2));
        assert_eq!(object.insert("z", 4), None);
        assert_eq!(
            object.into_iter().collect::<Vec<_>>(),
            [("a", 3), ("m", 2), ("z", 4)]
        );
    }
    #[test]
    fn map_equality_is_independent_of_iteration_order() {
        let left = JsonObject::from([("z", 0), ("a", 1)]);
        let right = JsonObject::from([("a", 1), ("z", 0)]);
        assert_eq!(left, right);
        assert_ne!(
            left.iter().collect::<Vec<_>>(),
            right.iter().collect::<Vec<_>>()
        );
    }
    #[test]
    fn mixed_mutations_match_order_and_index_reference() {
        let mut object = JsonObject::new();
        let mut reference = Vec::new();
        let mut seed = 19_u64;
        for value in 0..5_000 {
            seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1);
            let key = (seed >> 32) % 67;
            let position = reference.iter().position(|(k, _)| *k == key);
            if seed.is_multiple_of(3) {
                let expected = position.map(|index| reference.remove(index).1);
                assert_eq!(object.remove(&key), expected);
            } else {
                let expected = if let Some(index) = position {
                    Some(std::mem::replace(&mut reference[index].1, value))
                } else {
                    reference.push((key, value));
                    None
                };
                assert_eq!(object.insert(key, value), expected);
            }
            assert_eq!(
                object.iter().map(|(k, v)| (*k, *v)).collect::<Vec<_>>(),
                reference
            );
            for key in 0..67 {
                assert_eq!(
                    object.get(&key),
                    reference.iter().find(|(k, _)| *k == key).map(|(_, v)| v)
                );
            }
        }
    }
}
