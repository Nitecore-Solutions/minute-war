-- ===========================================================================
-- SEED: India Quiz question bank
--
-- Written as INSERT ... SELECT against the game code so this re-runs safely
-- and keeps working if the game ids ever change.
--
--   mysql -u minute_war -p minute_war < db/migrations/0002_seed_questions.sql
--
-- `options` is a JSON array of exactly 4 strings (enforced by CHECK).
-- `correct_index` is 0-based.
-- ===========================================================================

SET NAMES utf8mb4;

INSERT INTO `questions` (`game_id`, `prompt`, `options`, `correct_index`, `explanation`, `difficulty`, `points`)
SELECT id, q.prompt, q.options, q.correct_index, q.explanation, q.difficulty, q.points
FROM `mini_games`
JOIN (
  SELECT 'Who won the 2011 Cricket World Cup?' AS prompt,
         JSON_ARRAY('India', 'Sri Lanka', 'Australia', 'Pakistan') AS options,
         0 AS correct_index, 'Dhoni finished it with a six at the Wankhede.' AS explanation,
         'easy' AS difficulty, 100 AS points
  UNION ALL SELECT 'What is the capital of India?',
         JSON_ARRAY('Mumbai', 'New Delhi', 'Bengaluru', 'Chennai'), 1,
         'New Delhi has been the capital since 1931.', 'easy', 100
  UNION ALL SELECT 'Who is the current CEO of the BCCI? (as of 2025)',
         JSON_ARRAY('Jay Shah', 'Anurag Thakur', 'Sourav Ganguly', 'N. Srinivasan'), 0,
         'Jay Shah took over in October 2022.', 'medium', 120
  UNION ALL SELECT 'Which is the longest river entirely within India?',
         JSON_ARRAY('Ganga', 'Godavari', 'Yamuna', 'Narmada'), 1,
         'The Godavari flows 1,312 km, all inside India.', 'medium', 120
  UNION ALL SELECT 'How many states does India currently have?',
         JSON_ARRAY('28', '29', '30', '31'), 1,
         '29 after Telangana became the 29th in 2014.', 'easy', 100
  UNION ALL SELECT 'Who wrote the National Anthem of India?',
         JSON_ARRAY('Tagore', 'Nehru', 'Gandhi', 'Sarojini Naidu'), 0,
         'Jana Gana Mana by Rabindranath Tagore, 1911.', 'easy', 100
  UNION ALL SELECT 'Which is the highest civilian award in India?',
         JSON_ARRAY('Padma Shri', 'Bharat Ratna', 'Padma Bhushan', 'Param Vir Chakra'), 1,
         'Bharat Ratna, instituted in 1954.', 'easy', 100
  UNION ALL SELECT 'Mount Everest lies in which Indian state?',
         JSON_ARRAY('Sikkim', 'Uttarakhand', 'Himachal Pradesh', 'Jammu & Kashmir'), 1,
         'The summit is in Uttarakhand.', 'medium', 120
  UNION ALL SELECT 'Who founded the Indian National Congress?',
         JSON_ARRAY('Gandhi', 'A.O. Hume', 'Nehru', 'Lala Lajpat Rai'), 1,
         'A.O. Hume, in 1885.', 'medium', 120
  UNION ALL SELECT 'What is the currency of India?',
         JSON_ARRAY('Rupee', 'Rial', 'Taka', 'Dinar'), 0,
         'The Indian Rupee, INR, symbol â‚¹.', 'easy', 100
  UNION ALL SELECT 'Which dance form originated in Kerala?',
         JSON_ARRAY('Bharatanatyam', 'Kathakali', 'Odissi', 'Kuchipudi'), 1,
         'Kathakali, from the Kathakali school of Malabar.', 'medium', 120
  UNION ALL SELECT 'Taj Mahal was built by which emperor?',
         JSON_ARRAY('Akbar', 'Jahangir', 'Shah Jahan', 'Aurangzeb'), 2,
         'Shah Jahan, as a tomb for Mumtaz Mahal.', 'easy', 100
  UNION ALL SELECT 'Which is the largest state in India by area?',
         JSON_ARRAY('Madhya Pradesh', 'Rajasthan', 'Maharashtra', 'Gujarat'), 1,
         'Rajasthan, 342,239 kmÂ².', 'medium', 120
  UNION ALL SELECT 'Who was the first woman Prime Minister of India?',
         JSON_ARRAY('Sarojini Naidu', 'Indira Gandhi', 'Jayalalithaa', 'Hema Malini'), 0,
         'Sarojini Naidu, 1966.', 'easy', 100
  UNION ALL SELECT 'Which planet is known as the Red Planet?',
         JSON_ARRAY('Venus', 'Mars', 'Jupiter', 'Mercury'), 1,
         'Mars, from iron oxide on its surface.', 'easy', 100
  UNION ALL SELECT 'The Indian Parliament building is called?',
         JSON_ARRAY('India Gate', 'Rashtrapati Bhavan', 'Sansad Bhavan', 'Red Fort'), 2,
         'Sansad Bhavan, designed by Edwin Lutyens.', 'easy', 100
  UNION ALL SELECT 'Which monsoon hits India first, on the Kerala coast?',
         JSON_ARRAY('Winter monsoon', 'South-West monsoon', 'North-East monsoon', 'None'), 1,
         'The South-West monsoon arrives on the Kerala coast around June 1.', 'medium', 120
  UNION ALL SELECT 'How many players are on the field per side in cricket?',
         JSON_ARRAY('9', '10', '11', '12'), 2,
         'Eleven, with one bowler at a time.', 'easy', 100
  UNION ALL SELECT 'Who is the god of cricket in Indian culture?',
         JSON_ARRAY('Hanuman', 'Krishna', 'Shiva', 'Ganesha'), 1,
         'Krishna, who is shown holding a bat and a flower.', 'medium', 120
  UNION ALL SELECT 'Which is the largest island of India?',
         JSON_ARRAY('Elephanta', 'Andaman', 'Santorini', 'Havelock'), 1,
         'Andaman Island, in the Bay of Bengal.', 'medium', 120
  UNION ALL SELECT 'The Kumbh Mela is held every how many years?',
         JSON_ARRAY('3', '6', '12', '25'), 2,
         'Held at the Kumbh every 12 years; the Ardha Kumbh every 6.', 'easy', 100
  UNION ALL SELECT 'Who was the first Indian in space?',
         JSON_ARRAY('Rakesh Sharma', 'Ravish Malhotra', 'Vikram Sarabhai', 'Kalpana Chawla'), 1,
         'Ravish Malhotra aboard Soyuz 7 in 1984.', 'hard', 150
  UNION ALL SELECT 'Which is the highest civilian award for sports in India?',
         JSON_ARRAY('Arjuna Award', 'Major Dhyan Chand Khel Ratna', 'Dronacharya Award', 'Padma Shri'), 1,
         'Major Dhyan Chand Khel Ratna, instituted in 1991.', 'medium', 120
  UNION ALL SELECT 'How many time zones does India use?',
         JSON_ARRAY('1', '2', '3', '4'), 0,
         'One, IST at UTC+5:30.', 'medium', 120
  UNION ALL SELECT 'Which organ is called the powerhouse of the cell?',
         JSON_ARRAY('Nucleus', 'Ribosome', 'Mitochondria', 'Golgi body'), 2,
         'Mitochondria generate ATP.', 'easy', 100
  UNION ALL SELECT 'The Charminar is a monument in which city?',
         JSON_ARRAY('Hyderabad', 'Pune', 'Lucknow', 'Ahmedabad'), 0,
         'Hyderabad, built in 1591.', 'easy', 100
  UNION ALL SELECT 'Which is Indiaâ€™s largest port?',
         JSON_ARRAY('Mumbai (JNPT)', 'Chennai', 'Kolkata', 'Cochin'), 0,
         'JNPT Mumbai handles the most container traffic.', 'medium', 120
  UNION ALL SELECT 'Who invented the vaccination against smallpox?',
         JSON_ARRAY('Louis Pasteur', 'Edward Jenner', 'Robert Koch', 'Alexander Fleming'), 1,
         'Edward Jenner, in 1796.', 'medium', 120
  UNION ALL SELECT 'The Western Ghats run along which side of India?',
         JSON_ARRAY('West', 'East', 'North', 'South'), 0,
         'They hug the western coast.', 'medium', 120
  UNION ALL SELECT 'Which festival celebrates the victory of good over evil?',
         JSON_ARRAY('Holi', 'Diwali', 'Eid', 'Onam'), 1,
         'Deepavali, the festival of lights.', 'easy', 100
  UNION ALL SELECT 'Who is known as the Father of the Indian Green Revolution?',
         JSON_ARRAY('M.S. Swaminathan', 'Norman Borlaug', 'P.K. Lahiri', 'B. P. Singh'), 0,
         'M.S. Swaminathan, 2020 World Food Prize.', 'hard', 150
  UNION ALL SELECT 'How many national highways were renumbered in the 2010 reclassification?',
         JSON_ARRAY('Old NH-1 to NH-44', 'Old NH-2 to NH-19', 'All of the above', 'None'), 2,
         'India went from 192 numbers to a 1â€“99 grid; NH 44 is the longest.', 'hard', 150
  UNION ALL SELECT 'Which is Indiaâ€™s longest road tunnel?',
         JSON_ARRAY('Chenab Rail Bridge', 'Atal Tunnel', 'Sela Tunnel', 'Pir Panjal'), 1,
         'The Atal Tunnel, 9.02 km, under Rohtang Pass.', 'hard', 150
  UNION ALL SELECT 'The Rs 500 note features whose portrait?',
         JSON_ARRAY('Mahatma Gandhi', 'Bhagat Singh', 'B.R. Ambedkar', 'Rabindranath Tagore'), 1,
         'The Mahatma Gandhi Series was introduced in 1996.', 'medium', 120
  UNION ALL SELECT 'Which Indian city is called the Manchester of the South?',
         JSON_ARRAY('Coimbatore', 'Madurai', 'Kochi', 'Mysuru'), 0,
         'Coimbatore, for its textile mills.', 'hard', 150
  UNION ALL SELECT 'Where is the IIM campus first set up in India?',
         JSON_ARRAY('Ahmedabad', 'Calcutta', 'Bombay', 'Madras'), 1,
         'Calcutta (Kolkata), 1961.', 'hard', 150
  UNION ALL SELECT 'The Northeast Frontier Agency is now called:',
         JSON_ARRAY('Arunachal East', 'Arunachal Pradesh', 'Assam Frontier', 'North-East Frontier State'), 1,
         'Arunachal Pradesh, renamed in 1972.', 'medium', 120
  UNION ALL SELECT 'How many players per team in a kabaddi match?',
         JSON_ARRAY('5', '6', '7', '8'), 2,
         'Seven per side on the mat.', 'medium', 120
  UNION ALL SELECT 'The Ashoka Chakra is awarded for',
         JSON_ARRAY('Civil service', 'Military valour', 'Sports', 'Science'), 1,
         'It is the highest wartime gallantry medal for civilians in combat.', 'medium', 120
  UNION ALL SELECT 'Indiaâ€™s first satellite was named',
         JSON_ARRAY('Aryabhata', 'Rohini', 'INSAT', 'GSLV'), 0,
         'Aryabhata, launched in 1975.', 'easy', 100
  UNION ALL SELECT 'Which company is known as the "Taj Mahal of the South"?',
         JSON_ARRAY('Bajaj', 'TVS Motors', 'Hero MotoCorp', 'Royal Enfield'), 1,
         'TVS Motors, for its Hosur plant.', 'hard', 150
  UNION ALL SELECT 'Which state produces the most milk in India?',
         JSON_ARRAY('Kerala', 'Rajasthan', 'Uttar Pradesh', 'Gujarat'), 2,
         'Uttar Pradesh, around 6â€“7% of national output.', 'hard', 150
  UNION ALL SELECT 'The Statue of Unity is located in which state?',
         JSON_ARRAY('Gujarat', 'Maharashtra', 'Rajasthan', 'Goa'), 0,
         'Kevadia, Gujarat. Twice the height of the Statue of Liberty.', 'easy', 100
  UNION ALL SELECT 'Which is the largest backwater lake system in India?',
         JSON_ARRAY('Vembanad', 'Chilika', 'Sambhar', 'Dal'), 0,
         'Vembanad, in Kerala.', 'hard', 150
  UNION ALL SELECT 'Which cricketer has the most international centuries?',
         JSON_ARRAY('Virat Kohli', 'Sachin Tendulkar', 'Ricky Ponting', 'Kumar Sangakkara'), 1,
         'Sachin Tendulkar, 100 across all formats.', 'easy', 100
  UNION ALL SELECT 'GST was rolled out in India on which date?',
         JSON_ARRAY('1 July 2017', '1 April 2017', '1 Jan 2018', '15 Aug 2017'), 0,
         '1 July 2017, the 70th Independence Day.', 'medium', 120
  UNION ALL SELECT 'Which is the deepest lake in India?',
         JSON_ARRAY('Vembanad', 'Dal', 'Gobind Sagar', 'Chilika'), 1,
         'Dal Lake, Kashmir, max depth 46 m.', 'hard', 150
  UNION ALL SELECT 'The "Ganga" and "Yamuna" meet at',
         JSON_ARRAY('Prayagraj', 'Patna', 'Varanasi', 'Haridwar'), 0,
         'The Sangam at Prayagraj.', 'medium', 120
  UNION ALL SELECT 'Who is known as the Father of the Green Revolution in India? (M.S.)',
         JSON_ARRAY('Swaminathan', 'Shastri', 'Krishnamurti', 'Bose'), 0,
         'Prof. M.S. Swaminathan.', 'easy', 100
) AS q
WHERE `mini_games`.code = 'india-quiz'
  AND NOT EXISTS (
    SELECT 1 FROM `questions` existing
     WHERE existing.game_id = `mini_games`.id AND existing.prompt = q.prompt
  );

-- ---------------------------------------------------------------------------
-- Confirm the bank landed where it should.
-- ---------------------------------------------------------------------------
SELECT g.code, COUNT(q.id) AS question_count
  FROM `mini_games` g
  LEFT JOIN `questions` q ON q.game_id = g.id
 GROUP BY g.code
 ORDER BY g.sort_order;