/** Static demo content, kept out of the seed logic so it reads like a data sheet. */

export const DEMO_PASSWORD = 'Password123!';

export const SUBJECT_SET = [
  { name: 'English', code: 'ENG' },
  { name: 'Hindi', code: 'HIN' },
  { name: 'Mathematics', code: 'MAT' },
  { name: 'Science', code: 'SCI' },
  { name: 'Social Studies', code: 'SST' },
  { name: 'Computer Science', code: 'CSC' },
];

export const TEACHERS = [
  { name: 'Meera Iyer', email: 'meera.iyer@dpa.edu', phone: '9820000001', employeeId: 'EMP-001', subject: 'MAT', qualification: 'M.Sc, B.Ed', designation: 'Senior Teacher' },
  { name: 'Rohit Verma', email: 'rohit.verma@dpa.edu', phone: '9820000002', employeeId: 'EMP-002', subject: 'SCI', qualification: 'M.Sc Physics', designation: 'Teacher' },
  { name: 'Anjali Nair', email: 'anjali.nair@dpa.edu', phone: '9820000003', employeeId: 'EMP-003', subject: 'ENG', qualification: 'M.A English', designation: 'Teacher' },
  { name: 'Suresh Patil', email: 'suresh.patil@dpa.edu', phone: '9820000004', employeeId: 'EMP-004', subject: 'SST', qualification: 'M.A History', designation: 'Teacher' },
  { name: 'Kavita Rao', email: 'kavita.rao@dpa.edu', phone: '9820000005', employeeId: 'EMP-005', subject: 'HIN', qualification: 'M.A Hindi', designation: 'Teacher' },
  { name: 'Imran Sheikh', email: 'imran.sheikh@dpa.edu', phone: '9820000006', employeeId: 'EMP-006', subject: 'CSC', qualification: 'B.Tech CSE', designation: 'Teacher' },
  { name: 'Deepa Menon', email: 'deepa.menon@dpa.edu', phone: '9820000007', employeeId: 'EMP-007', subject: 'MAT', qualification: 'M.Sc Maths', designation: 'Teacher' },
  { name: 'Arun Joshi', email: 'arun.joshi@dpa.edu', phone: '9820000008', employeeId: 'EMP-008', subject: 'SCI', qualification: 'M.Sc Chemistry', designation: 'Teacher' },
  { name: 'Ritu Bansal', email: 'ritu.bansal@dpa.edu', phone: '9820000009', employeeId: 'EMP-009', subject: 'ENG', qualification: 'M.A English', designation: 'Teacher' },
  { name: 'Vikram Singh', email: 'vikram.singh@dpa.edu', phone: '9820000010', employeeId: 'EMP-010', subject: 'SST', qualification: 'M.A Geography', designation: 'Teacher' },
];

export const STAFF = [
  { name: 'Neha Kulkarni', email: 'neha.kulkarni@dpa.edu', phone: '9830000001', employeeId: 'STF-001', designation: 'Receptionist', department: 'Front office' },
  { name: 'Sanjay Gupta', email: 'sanjay.gupta@dpa.edu', phone: '9830000002', employeeId: 'STF-002', designation: 'Accountant', department: 'Finance' },
  { name: 'Latha Krishnan', email: 'latha.krishnan@dpa.edu', phone: '9830000003', employeeId: 'STF-003', designation: 'Librarian', department: 'Library' },
];

/** 32 students spread across five sections, with guardians and shared siblings. */
export const STUDENTS = [
  { first: 'Aarav', last: 'Sharma', section: '5-A', gender: 'MALE', family: 'F1' },
  { first: 'Anaya', last: 'Sharma', section: '2-A', gender: 'FEMALE', family: 'F1' },
  { first: 'Vivaan', last: 'Mehta', section: '5-A', gender: 'MALE', family: 'F2' },
  { first: 'Diya', last: 'Mehta', section: '1-A', gender: 'FEMALE', family: 'F2' },
  { first: 'Aditya', last: 'Reddy', section: '5-A', gender: 'MALE', family: 'F3' },
  { first: 'Ishita', last: 'Reddy', section: '10-A', gender: 'FEMALE', family: 'F3' },
  { first: 'Kabir', last: 'Khan', section: '5-A', gender: 'MALE', family: 'F4' },
  { first: 'Myra', last: 'Khan', section: '1-B', gender: 'FEMALE', family: 'F4' },
  { first: 'Reyansh', last: 'Gupta', section: '5-A', gender: 'MALE', family: 'F5' },
  { first: 'Saanvi', last: 'Gupta', section: '2-A', gender: 'FEMALE', family: 'F5' },
  { first: 'Arjun', last: 'Nambiar', section: '5-A', gender: 'MALE', family: 'F6' },
  { first: 'Aadhya', last: 'Nambiar', section: '10-A', gender: 'FEMALE', family: 'F6' },
  { first: 'Vihaan', last: 'Bose', section: '5-A', gender: 'MALE', family: 'F7' },
  { first: 'Kiara', last: 'Bose', section: '1-A', gender: 'FEMALE', family: 'F7' },
  { first: 'Ayaan', last: 'Desai', section: '5-A', gender: 'MALE', family: 'F8' },
  { first: 'Anika', last: 'Desai', section: '2-A', gender: 'FEMALE', family: 'F8' },
  { first: 'Krishna', last: 'Pillai', section: '5-A', gender: 'MALE', family: 'F9' },
  { first: 'Navya', last: 'Pillai', section: '10-A', gender: 'FEMALE', family: 'F9' },
  { first: 'Ishaan', last: 'Chopra', section: '5-A', gender: 'MALE', family: 'F10' },
  { first: 'Riya', last: 'Chopra', section: '1-B', gender: 'FEMALE', family: 'F10' },
  { first: 'Advait', last: 'Kulkarni', section: '10-A', gender: 'MALE', family: 'F11' },
  { first: 'Pari', last: 'Kulkarni', section: '2-A', gender: 'FEMALE', family: 'F11' },
  { first: 'Shaurya', last: 'Menon', section: '10-A', gender: 'MALE', family: 'F12' },
  { first: 'Aarohi', last: 'Menon', section: '1-A', gender: 'FEMALE', family: 'F12' },
  { first: 'Atharv', last: 'Jain', section: '10-A', gender: 'MALE', family: 'F13' },
  { first: 'Sara', last: 'Jain', section: '1-B', gender: 'FEMALE', family: 'F13' },
  { first: 'Dhruv', last: 'Malhotra', section: '10-A', gender: 'MALE', family: 'F14' },
  { first: 'Avni', last: 'Malhotra', section: '2-A', gender: 'FEMALE', family: 'F14' },
  { first: 'Rudra', last: 'Saxena', section: '10-A', gender: 'MALE', family: 'F15' },
  { first: 'Ira', last: 'Saxena', section: '1-A', gender: 'FEMALE', family: 'F15' },
  { first: 'Yuvaan', last: 'Kapoor', section: '10-A', gender: 'MALE', family: 'F16' },
  { first: 'Zara', last: 'Kapoor', section: '1-B', gender: 'FEMALE', family: 'F16' },
] as const;

/** One guardian household per family — the first is the demo parent account. */
export const FAMILIES = [
  { key: 'F1', father: 'Rajesh Sharma', mother: 'Sunita Sharma', phone: '9810000001', altPhone: '9811000001', occupation: 'Software Engineer' },
  { key: 'F2', father: 'Nitin Mehta', mother: 'Pooja Mehta', phone: '9810000002', altPhone: '9811000002', occupation: 'Chartered Accountant' },
  { key: 'F3', father: 'Srinivas Reddy', mother: 'Lakshmi Reddy', phone: '9810000003', altPhone: '9811000003', occupation: 'Doctor' },
  { key: 'F4', father: 'Imtiaz Khan', mother: 'Farida Khan', phone: '9810000004', altPhone: '9811000004', occupation: 'Businessman' },
  { key: 'F5', father: 'Manoj Gupta', mother: 'Rekha Gupta', phone: '9810000005', altPhone: '9811000005', occupation: 'Bank Manager' },
  { key: 'F6', father: 'Praveen Nambiar', mother: 'Divya Nambiar', phone: '9810000006', altPhone: '9811000006', occupation: 'Architect' },
  { key: 'F7', father: 'Sanjoy Bose', mother: 'Moushumi Bose', phone: '9810000007', altPhone: '9811000007', occupation: 'Professor' },
  { key: 'F8', father: 'Hiren Desai', mother: 'Nisha Desai', phone: '9810000008', altPhone: '9811000008', occupation: 'Entrepreneur' },
  { key: 'F9', father: 'Ramesh Pillai', mother: 'Geetha Pillai', phone: '9810000009', altPhone: '9811000009', occupation: 'Civil Engineer' },
  { key: 'F10', father: 'Vikas Chopra', mother: 'Simran Chopra', phone: '9810000010', altPhone: '9811000010', occupation: 'Marketing Head' },
  { key: 'F11', father: 'Prashant Kulkarni', mother: 'Madhuri Kulkarni', phone: '9810000011', altPhone: '9811000011', occupation: 'Pharmacist' },
  { key: 'F12', father: 'Gopal Menon', mother: 'Radhika Menon', phone: '9810000012', altPhone: '9811000012', occupation: 'Consultant' },
  { key: 'F13', father: 'Ashok Jain', mother: 'Meenal Jain', phone: '9810000013', altPhone: '9811000013', occupation: 'Jeweller' },
  { key: 'F14', father: 'Rohit Malhotra', mother: 'Tanya Malhotra', phone: '9810000014', altPhone: '9811000014', occupation: 'Pilot' },
  { key: 'F15', father: 'Alok Saxena', mother: 'Shruti Saxena', phone: '9810000015', altPhone: '9811000015', occupation: 'Lawyer' },
  { key: 'F16', father: 'Karan Kapoor', mother: 'Nidhi Kapoor', phone: '9810000016', altPhone: '9811000016', occupation: 'Restaurateur' },
  { key: 'F17', father: 'Sunil Bhatt', mother: 'Anita Bhatt', phone: '9810000017', altPhone: '9811000017', occupation: 'Contractor' },
  { key: 'F18', father: 'Naveen Rao', mother: 'Shalini Rao', phone: '9810000018', altPhone: '9811000018', occupation: 'Scientist' },
  { key: 'F19', father: 'Mahesh Iyer', mother: 'Vidya Iyer', phone: '9810000019', altPhone: '9811000019', occupation: 'Auditor' },
  { key: 'F20', father: 'Zubair Ahmed', mother: 'Sana Ahmed', phone: '9810000020', altPhone: '9811000020', occupation: 'Trader' },
];

export const PERIOD_TEMPLATE = [
  { name: 'Period 1', order: 1, startTime: '08:00', endTime: '08:45', isBreak: false },
  { name: 'Period 2', order: 2, startTime: '08:45', endTime: '09:30', isBreak: false },
  { name: 'Short break', order: 3, startTime: '09:30', endTime: '09:45', isBreak: true },
  { name: 'Period 3', order: 4, startTime: '09:45', endTime: '10:30', isBreak: false },
  { name: 'Period 4', order: 5, startTime: '10:30', endTime: '11:15', isBreak: false },
  { name: 'Lunch', order: 6, startTime: '11:15', endTime: '12:00', isBreak: true },
  { name: 'Period 5', order: 7, startTime: '12:00', endTime: '12:45', isBreak: false },
  { name: 'Period 6', order: 8, startTime: '12:45', endTime: '13:30', isBreak: false },
];

export const FEE_CATEGORIES = [
  { name: 'Tuition fee', code: 'TUITION', isRecurring: true },
  { name: 'Admission fee', code: 'ADMISSION', isRecurring: false },
  { name: 'Transport fee', code: 'TRANSPORT', isRecurring: true },
  { name: 'Examination fee', code: 'EXAM', isRecurring: true },
  { name: 'Activity fee', code: 'ACTIVITY', isRecurring: true },
  { name: 'Library fee', code: 'LIBRARY', isRecurring: true },
];
